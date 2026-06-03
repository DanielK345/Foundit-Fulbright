package com.foundit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ConversationSummary {

    private Long partnerId;
    private String partnerName;
    private String partnerEmail;
    private Long itemId;
    private String itemName;
    private String lastMessage;
    private LocalDateTime lastMessageTime;
    private int unreadCount;
    private boolean partnerIsAnonymous;
}
