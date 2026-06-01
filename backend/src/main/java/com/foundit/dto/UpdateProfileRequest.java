package com.foundit.dto;

import lombok.Data;

@Data
public class UpdateProfileRequest {
    private String name;
    private String profilePicture;
}
