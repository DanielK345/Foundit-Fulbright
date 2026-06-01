package com.foundit.service;

import com.foundit.dto.ChatMessageResponse;
import com.foundit.dto.ConversationSummary;
import com.foundit.model.ChatMessage;
import com.foundit.model.Item;
import com.foundit.model.User;
import com.foundit.repository.ChatMessageRepository;
import com.foundit.repository.ItemRepository;
import com.foundit.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;
    private final ItemRepository itemRepository;
    private final NotificationService notificationService;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public ChatMessageResponse sendMessage(Long senderId, Long recipientId, Long itemId, String content) {
        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new IllegalArgumentException("Sender not found"));
        User recipient = userRepository.findById(recipientId)
                .orElseThrow(() -> new IllegalArgumentException("Recipient not found"));

        // Determine anonymity: check if sender posted an item with isPublic=false
        boolean senderIsAnonymous = false;
        if (itemId != null) {
            senderIsAnonymous = itemRepository.findById(itemId)
                    .map(item -> item.getUser().getId().equals(senderId) && !item.isPublic())
                    .orElse(false);
        }

        ChatMessage message = ChatMessage.builder()
                .sender(sender)
                .recipient(recipient)
                .content(content)
                .relatedItemId(itemId)
                .senderIsAnonymous(senderIsAnonymous)
                .read(false)
                .build();

        message = chatMessageRepository.save(message);

        ChatMessageResponse response = toResponse(message);

        // Push real-time message
        try {
            messagingTemplate.convertAndSendToUser(
                    recipient.getEmail(),
                    "/queue/messages",
                    response);
        } catch (Exception ignored) {}

        // Send notification
        notificationService.sendNotification(
                recipient,
                (senderIsAnonymous ? "Anonymous Member" : sender.getName()) + " sent you a message",
                null, itemId, senderId,
                senderIsAnonymous ? "Anonymous Member" : sender.getName());

        return response;
    }

    @Transactional
    public List<ChatMessageResponse> getConversation(Long userId, Long partnerId, Long itemId) {
        List<ChatMessage> messages = chatMessageRepository.findConversation(userId, partnerId, itemId);

        // Mark unread messages from partner as read
        List<ChatMessage> unread = chatMessageRepository.findUnreadFrom(userId, partnerId);
        unread.forEach(m -> m.setRead(true));
        chatMessageRepository.saveAll(unread);

        return messages.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ConversationSummary> getConversations(Long userId) {
        List<Object[]> rows = chatMessageRepository.findConversationPartnerAndItemIds(userId);
        List<ConversationSummary> summaries = new ArrayList<>();

        for (Object[] row : rows) {
            Long partnerId = ((Number) row[0]).longValue();
            Long itemId = row[1] != null ? ((Number) row[1]).longValue() : null;

            User partner = userRepository.findById(partnerId).orElse(null);
            if (partner == null) continue;

            List<ChatMessage> messages = chatMessageRepository.findConversation(userId, partnerId, itemId);
            if (messages.isEmpty()) continue;

            ChatMessage last = messages.get(messages.size() - 1);
            long unread = chatMessageRepository.countUnreadFrom(userId, partnerId);

            String itemName = null;
            if (itemId != null) {
                itemName = itemRepository.findById(itemId).map(Item::getName).orElse(null);
            }

            summaries.add(ConversationSummary.builder()
                    .partnerId(partnerId)
                    .partnerName(partner.getName())
                    .partnerProfilePicture(partner.getProfilePicture())
                    .relatedItemId(itemId)
                    .relatedItemName(itemName)
                    .lastMessage(last.getContent())
                    .lastMessageTime(last.getSentAt())
                    .unreadCount(unread)
                    .build());
        }

        return summaries;
    }

    private ChatMessageResponse toResponse(ChatMessage msg) {
        User sender = msg.getSender();
        return ChatMessageResponse.builder()
                .id(msg.getId())
                .senderId(sender.getId())
                .senderName(msg.isSenderIsAnonymous() ? "Anonymous Member" : sender.getName())
                .senderProfilePicture(msg.isSenderIsAnonymous() ? null : sender.getProfilePicture())
                .recipientId(msg.getRecipient().getId())
                .content(msg.getContent())
                .sentAt(msg.getSentAt())
                .read(msg.isRead())
                .senderIsAnonymous(msg.isSenderIsAnonymous())
                .relatedItemId(msg.getRelatedItemId())
                .build();
    }
}
