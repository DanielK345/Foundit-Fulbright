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
public class NotificationResponse {

    private Long id;
    private String message;
    private String status;
    private LocalDateTime timestamp;
    private Long matchId;
    private Long lostItemId;
    private Long foundItemId;
    private Long chatSenderId;
    private String chatSenderName;
    private Long relatedItemId;
}
