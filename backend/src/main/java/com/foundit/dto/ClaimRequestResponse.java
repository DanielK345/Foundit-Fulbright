package com.foundit.dto;

import com.foundit.model.ClaimRequestStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ClaimRequestResponse {
    private Long id;
    private Long itemId;
    private Long claimantId;
    private String claimantName;
    private String claimantEmail;
    private ClaimRequestStatus status;
    private LocalDateTime createdAt;
}