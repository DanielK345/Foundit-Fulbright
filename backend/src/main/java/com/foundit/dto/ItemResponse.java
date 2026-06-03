package com.foundit.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
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
    private String status;
    private String itemType;
    private LocalDateTime datePosted;
    private LocalDate dateEvent;
    private Long reporterId;
    private String reporterName;
    private String reporterEmail;
    private Long claimantId;
    private String claimantName;
    @JsonProperty("isPublic")
    private boolean isPublic;
    private Boolean currentUserHasPendingClaim;
    private Integer pendingClaimCount;
}

