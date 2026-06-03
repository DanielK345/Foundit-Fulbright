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
public class HistoryResponse {

    private Long id;
    private String actionType;
    private LocalDateTime timestamp;
    private Long itemId;
    private String itemName;
}
