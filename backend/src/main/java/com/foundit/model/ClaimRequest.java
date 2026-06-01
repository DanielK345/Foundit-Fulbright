package com.foundit.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "claim_requests",
        uniqueConstraints = @UniqueConstraint(columnNames = {"item_id", "claimant_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClaimRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "claimant_id", nullable = false)
    private User claimant;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClaimRequestStatus status;

    @CreationTimestamp
    private LocalDateTime createdAt;
}
