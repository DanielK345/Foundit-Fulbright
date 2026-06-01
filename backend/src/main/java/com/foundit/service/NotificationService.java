package com.foundit.service;

import com.foundit.dto.NotificationResponse;
import com.foundit.model.*;
import com.foundit.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public void sendNotification(User user, String message, Match match, Long relatedItemId,
                                  Long chatSenderId, String chatSenderName) {
        Notification notification = Notification.builder()
                .user(user)
                .message(message)
                .match(match)
                .relatedItemId(relatedItemId)
                .chatSenderId(chatSenderId)
                .chatSenderName(chatSenderName)
                .status(NotificationStatus.UNREAD)
                .build();

        notification = notificationRepository.save(notification);
        NotificationResponse response = toResponse(notification);
        pushToUser(user, response);
    }

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotifications(Long userId) {
        return notificationRepository.findByUserIdOrderByTimestampDesc(userId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public NotificationResponse markAsRead(Long notificationId, Long userId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));

        if (!notification.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Not your notification");
        }

        notification.setStatus(NotificationStatus.READ);
        return toResponse(notificationRepository.save(notification));
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUserIdAndStatus(userId, NotificationStatus.UNREAD);
    }

    private void pushToUser(User user, NotificationResponse response) {
        try {
            messagingTemplate.convertAndSendToUser(
                    user.getEmail(),
                    "/queue/notifications",
                    response);
        } catch (Exception ignored) {
            // User is offline; notification is in DB for next login
        }
    }

    public NotificationResponse toResponse(Notification n) {
        return NotificationResponse.builder()
                .id(n.getId())
                .message(n.getMessage())
                .status(n.getStatus().name())
                .timestamp(n.getTimestamp())
                .matchId(n.getMatch() != null ? n.getMatch().getId() : null)
                .relatedItemId(n.getRelatedItemId())
                .chatSenderId(n.getChatSenderId())
                .chatSenderName(n.getChatSenderName())
                .build();
    }
}
