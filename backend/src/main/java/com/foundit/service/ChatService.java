package com.foundit.service;

import com.foundit.dto.ChatMessageResponse;
import com.foundit.dto.ConversationSummary;
import com.foundit.model.ChatMessage;
import com.foundit.model.Item;
import com.foundit.model.User;
import com.foundit.repository.ChatMessageRepository;
import com.foundit.repository.ItemRepository;
import com.foundit.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final UserRepository userRepository;
    private final ItemRepository itemRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationService notificationService;

    @Transactional
    public List<ChatMessageResponse> getConversation(Long userAId, Long userBId, Long itemId) {
        List<ChatMessage> messages = chatMessageRepository.findConversation(userAId, userBId, itemId);

        // Mark unread messages as read
        List<ChatMessage> unread = chatMessageRepository.findUnreadFrom(userAId, userBId, itemId);
        unread.forEach(m -> m.setRead(true));
        chatMessageRepository.saveAll(unread);

        return messages.stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional
    public ChatMessageResponse sendMessage(Long senderId, Long recipientId, String content, Long itemId) {
        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new EntityNotFoundException("Sender not found"));
        User recipient = userRepository.findById(recipientId)
                .orElseThrow(() -> new EntityNotFoundException("Recipient not found"));

        // senderIsAnonymous = true only if THIS sender posted that specific item anonymously
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
                .read(false)
                .senderIsAnonymous(senderIsAnonymous)
                .relatedItemId(itemId)
                .build();

        ChatMessage saved = chatMessageRepository.save(message);
        ChatMessageResponse response = toResponse(saved);

        // Push real-time message to recipient's chat
        messagingTemplate.convertAndSendToUser(
                recipient.getEmail(),
                "/queue/messages",
                response);

        // Create a notification for the recipient
        String senderDisplayName = senderIsAnonymous ? "Anonymous Member"
                : (sender.getName() != null && !sender.getName().isBlank())
                        ? sender.getName()
                        : sender.getEmail().split("@")[0];
        String preview = content.length() > 60 ? content.substring(0, 60) + "..." : content;
        notificationService.createChatNotification(recipient, sender.getId(), senderDisplayName, preview, itemId);

        return response;
    }

    @Transactional(readOnly = true)
    public List<ConversationSummary> getConversationList(Long userId) {
        // Each (partnerId, itemId) pair is a separate conversation thread
        List<Object[]> pairs = chatMessageRepository.findConversationPartnerAndItemIds(userId);
        List<ConversationSummary> summaries = new ArrayList<>();

        for (Object[] row : pairs) {
            Long partnerId = ((Number) row[0]).longValue();
            Long itemId = row[1] != null ? ((Number) row[1]).longValue() : null;

            User partner = userRepository.findById(partnerId).orElse(null);
            if (partner == null) continue;

            List<ChatMessage> conversation = chatMessageRepository.findConversation(userId, partnerId, itemId);
            if (conversation.isEmpty()) continue;

            ChatMessage lastMsg = conversation.get(conversation.size() - 1);
            int unreadCount = itemId != null
                    ? chatMessageRepository.findUnreadFrom(userId, partnerId, itemId).size()
                    : 0;

            // Check if partner sent any message marked anonymous
            boolean partnerIsAnonymous = conversation.stream()
                    .anyMatch(m -> m.getSender().getId().equals(partnerId) && m.isSenderIsAnonymous());

            // Fallback: if partner hasn't replied yet, check the item directly
            if (!partnerIsAnonymous && itemId != null) {
                partnerIsAnonymous = itemRepository.findById(itemId)
                        .map(item -> item.getUser().getId().equals(partnerId) && !item.isPublic())
                        .orElse(false);
            }

            // Get item name for display in sidebar
            String itemName = itemId != null
                    ? itemRepository.findById(itemId).map(Item::getName).orElse(null)
                    : null;

            String partnerDisplayName = partnerIsAnonymous ? "Anonymous Member" : partner.getName();
            summaries.add(ConversationSummary.builder()
                    .partnerId(partnerId)
                    .partnerName(partnerDisplayName)
                    .partnerEmail(partnerIsAnonymous ? null : partner.getEmail())
                    .itemId(itemId)
                    .itemName(itemName)
                    .lastMessage(lastMsg.getContent())
                    .lastMessageTime(lastMsg.getSentAt())
                    .unreadCount(unreadCount)
                    .partnerIsAnonymous(partnerIsAnonymous)
                    .build());
        }

        // Deduplicate:
        // - Anonymous conversations: keyed by (partnerId, itemId) — each anonymous item is its own thread
        // - Non-anonymous conversations: keyed by partnerId — one thread per person
        summaries.sort((a, b) -> {
            if (a.getLastMessageTime() == null) return 1;
            if (b.getLastMessageTime() == null) return -1;
            return b.getLastMessageTime().compareTo(a.getLastMessageTime());
        });
        // Key by (partnerId, itemId) when there is an item — keeps each item's thread separate
        // regardless of anonymity. Key by partnerId alone for direct (no-item) conversations.
        Map<String, ConversationSummary> deduped = new LinkedHashMap<>();
        for (ConversationSummary s : summaries) {
            String key = s.getItemId() != null
                    ? s.getPartnerId() + "-" + s.getItemId()
                    : String.valueOf(s.getPartnerId());
            deduped.putIfAbsent(key, s);
        }

        return new ArrayList<>(deduped.values());
    }

    private ChatMessageResponse toResponse(ChatMessage msg) {
        boolean anon = msg.isSenderIsAnonymous();
        return ChatMessageResponse.builder()
                .id(msg.getId())
                .senderId(msg.getSender().getId())
                .senderName(anon ? "Anonymous Member" : msg.getSender().getName())
                .recipientId(msg.getRecipient().getId())
                .recipientName(msg.getRecipient().getName())
                .content(msg.getContent())
                .sentAt(msg.getSentAt())
                .read(msg.isRead())
                .senderIsAnonymous(anon)
                .build();
    }
}
