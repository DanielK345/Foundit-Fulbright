package com.foundit.service;

import com.foundit.dto.NotificationResponse;
import com.foundit.model.Match;
import com.foundit.model.Notification;
import com.foundit.model.NotificationStatus;
import com.foundit.model.User;
import com.foundit.repository.NotificationRepository;
import jakarta.persistence.EntityNotFoundException;
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

    @Transactional(readOnly = true)
    public List<NotificationResponse> getNotificationsForUser(Long userId) {
        return notificationRepository.findByUserIdOrderByTimestampDesc(userId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public NotificationResponse markAsRead(Long notificationId, Long userId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Notification not found with id: " + notificationId));

        if (!notification.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("You do not own this notification");
        }

        notification.setStatus(NotificationStatus.READ);
        return toResponse(notificationRepository.save(notification));
    }

    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUserIdAndStatus(userId, NotificationStatus.UNREAD);
    }

    @Transactional
    public Notification createNotification(User user, Match match, String message, Long relatedItemId) {
        Notification notification = Notification.builder()
                .user(user)
                .match(match)
                .message(message)
                .relatedItemId(relatedItemId)
                .status(NotificationStatus.UNREAD)
                .build();
        Notification saved = notificationRepository.save(notification);
        pushToUser(user, toResponse(saved));
        return saved;
    }

    @Transactional
    public void createChatNotification(User recipient, Long senderId, String senderName, String messagePreview, Long relatedItemId) {
        Notification notification = Notification.builder()
                .user(recipient)
                .match(null)
                .message(messagePreview)
                .chatSenderId(senderId)
                .chatSenderName(senderName)
                .relatedItemId(relatedItemId)
                .status(NotificationStatus.UNREAD)
                .build();
        Notification saved = notificationRepository.save(notification);
        pushToUser(recipient, toResponse(saved));
    }

    @Transactional
    public void createClaimRequestNotification(User finder, Long itemId, String claimerName, String itemName) {
        Notification notification = Notification.builder()
                .user(finder)
                .message(claimerName + " want to claim " + itemName + ".")
                .relatedItemId(itemId)
                .status(NotificationStatus.UNREAD)
                .build();
        Notification saved = notificationRepository.save(notification);
        pushToUser(finder, toResponse(saved));
    }

    @Transactional
    public void createClaimResultNotification(User claimer, Long itemId, boolean matched) {
        String msg = matched
                ? "There is a high chance your item matches this found item. Contact the finder to discuss more."
                : "Your claim could not be verified. The description did not match our records.";
        Notification notification = Notification.builder()
                .user(claimer)
                .message(msg)
                .relatedItemId(itemId)
                .status(NotificationStatus.UNREAD)
                .build();
        Notification saved = notificationRepository.save(notification);
        pushToUser(claimer, toResponse(saved));
    }

    @Transactional
    public void createClaimMatchNotificationForFinder(User finder, Long itemId, String claimerName) {
        Notification notification = Notification.builder()
                .user(finder)
                .message(claimerName + " has verified to claim this item. There is a high chance this item belongs to them. Contact them to discuss.")
                .relatedItemId(itemId)
                .status(NotificationStatus.UNREAD)
                .build();
        Notification saved = notificationRepository.save(notification);
        pushToUser(finder, toResponse(saved));
    }

    private void pushToUser(User user, NotificationResponse response) {
        messagingTemplate.convertAndSendToUser(
                user.getEmail(),
                "/queue/notifications",
                response);
    }

    private NotificationResponse toResponse(Notification n) {
        Long matchId = n.getMatch() != null ? n.getMatch().getId() : null;
        Long lostItemId = (n.getMatch() != null && n.getMatch().getLostItem() != null)
                ? n.getMatch().getLostItem().getId() : null;
        Long foundItemId = (n.getMatch() != null && n.getMatch().getFoundItem() != null)
                ? n.getMatch().getFoundItem().getId() : null;

        return NotificationResponse.builder()
                .id(n.getId())
                .message(n.getMessage())
                .status(n.getStatus().name())
                .timestamp(n.getTimestamp())
                .matchId(matchId)
                .lostItemId(lostItemId)
                .foundItemId(foundItemId)
                .chatSenderId(n.getChatSenderId())
                .chatSenderName(n.getChatSenderName())
                .relatedItemId(n.getRelatedItemId())
                .build();
    }
}
