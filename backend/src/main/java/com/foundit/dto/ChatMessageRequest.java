package com.foundit.dto;

import lombok.Data;

@Data
public class ChatMessageRequest {
    private String content;
    private Long itemId;
}
