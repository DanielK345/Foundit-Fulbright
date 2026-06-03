package com.foundit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ClaimVerificationResponse {
    private boolean matched;
    private int score;
    private String message;
    private ItemResponse item;
}