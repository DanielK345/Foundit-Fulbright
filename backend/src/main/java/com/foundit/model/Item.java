package com.foundit.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;


@Entity
@Table(name = "items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Item {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    private String name;

    @Enumerated(EnumType.STRING)
    private ItemStatus itemType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @CreationTimestamp
    private LocalDateTime datePosted;

    private String locationFound;

    private String category;

    @Enumerated(EnumType.STRING)
    private ItemStatus status;

    @Column(columnDefinition = "TEXT")
    private String imageUrl;

    private Long claimantId;

    private LocalDate dateEvent;

    @Column(name = "is_public")
    private Boolean isPublic;

    public boolean isPublic() {
        return isPublic == null || isPublic;
    }
}
