package com.foundit.dto;

import lombok.Data;

@Data
public class ClaimVerificationRequest {
    private String name;
    private String location;
    private String description;
}
