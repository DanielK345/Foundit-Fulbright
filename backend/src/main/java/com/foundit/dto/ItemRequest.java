package com.foundit.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
public class ItemRequest {
    @NotBlank
    private String name;

    private String description;

    private String category;

    private String locationFound;

    private String imageUrl;

    private LocalDate dateEvent;

    private boolean isPublic = true;
}
