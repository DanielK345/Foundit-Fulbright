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
public class ClaimRequestResponse {
    private Long id;
    private Long itemId;
    private String itemName;
    private Long claimantId;
    private String claimantName;
    private String claimantEmail;
    private String claimantProfilePicture;
    private String status;
    private LocalDateTime createdAt;
}
