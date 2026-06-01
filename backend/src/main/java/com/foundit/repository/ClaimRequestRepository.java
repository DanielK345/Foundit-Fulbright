package com.foundit.repository;

import com.foundit.model.ClaimRequest;
import com.foundit.model.ClaimRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ClaimRequestRepository extends JpaRepository<ClaimRequest, Long> {
    List<ClaimRequest> findByItemIdAndStatus(Long itemId, ClaimRequestStatus status);
    boolean existsByItemIdAndClaimantIdAndStatus(Long itemId, Long claimantId, ClaimRequestStatus status);
    Optional<ClaimRequest> findByItemIdAndClaimantId(Long itemId, Long claimantId);
    void deleteByItemId(Long itemId);
}
