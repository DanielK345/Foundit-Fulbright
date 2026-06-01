package com.foundit.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class ItemResponse {
    private Long id;
    private String name;
    private String description;
    private String category;
    private String locationFound;
    private String imageUrl;
    private LocalDateTime datePosted;
    private LocalDate dateEvent;
    private String itemType;
    private String status;
    private Long reporterId;
    private String reporterName;
    private String reporterEmail;
    private String reporterProfilePicture;
    private Long claimantId;
    private boolean isPublic;
    private Boolean currentUserHasPendingClaim;
    private Integer pendingClaimCount;
}
