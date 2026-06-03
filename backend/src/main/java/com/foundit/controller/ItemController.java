package com.foundit.controller;
import com.foundit.dto.ClaimVerificationResponse;
import com.foundit.dto.ClaimVerificationRequest;
import com.foundit.dto.ItemRequest;
import com.foundit.dto.ItemResponse;
import com.foundit.model.ItemStatus;
import com.foundit.model.User;
import com.foundit.service.ItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.foundit.dto.ClaimRequestResponse;

import java.util.List;

@RestController
@RequestMapping("/api/items")
@RequiredArgsConstructor
public class ItemController {

    private final ItemService itemService;

    @GetMapping
    public ResponseEntity<List<ItemResponse>> getItems(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String keyword,
            @AuthenticationPrincipal User currentUser) {

        Long currentUserId = currentUser != null ? currentUser.getId() : null;

        return ResponseEntity.ok(
                itemService.getItems(status, category, keyword, currentUserId)
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<ItemResponse> getItemById(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {

        Long currentUserId = currentUser != null ? currentUser.getId() : null;

        return ResponseEntity.ok(
                itemService.getItemById(id, currentUserId)
        );
    }

    @PostMapping("/lost")
    public ResponseEntity<ItemResponse> reportLost(
            @Valid @RequestBody ItemRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.createItem(request, ItemStatus.LOST, currentUser.getId()));
    }

    @PostMapping("/found")
    public ResponseEntity<ItemResponse> reportFound(
            @Valid @RequestBody ItemRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.createItem(request, ItemStatus.FOUND, currentUser.getId()));
    }

    @PostMapping("/{id}/claim")
    public ResponseEntity<ItemResponse> claimItem(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.claimItem(id, currentUser.getId()));
    }

    /** Non-valuable: claimer requests claim, finder gets notified */
    @PostMapping("/{id}/claim/simple")
    public ResponseEntity<ItemResponse> requestSimpleClaim(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.requestSimpleClaim(id, currentUser.getId()));
    }

    /** Non-valuable: finder approves the pending claim */
    @PostMapping("/{id}/approve")
    public ResponseEntity<ItemResponse> approveClaim(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.approveClaim(id, currentUser.getId()));
    }

    /** Valuable: claimer submits verification form */
    @PostMapping("/{id}/claim/verify")
    public ResponseEntity<ClaimVerificationResponse> verifyAndClaim(
            @PathVariable Long id,
            @RequestBody ClaimVerificationRequest request,
            @AuthenticationPrincipal User currentUser) {

        return ResponseEntity.ok(
                itemService.verifyAndClaim(id, request, currentUser.getId())
        );
    }

    @GetMapping("/my")
    public ResponseEntity<List<ItemResponse>> getMyItems(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.getItemsByUser(currentUser.getId()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ItemResponse> updateItem(
            @PathVariable Long id,
            @Valid @RequestBody ItemRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.updateItem(id, request, currentUser.getId()));
    }
    @PostMapping("/{id}/recover")
    public ResponseEntity<ItemResponse> markLostItemAsRecovered(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {

        return ResponseEntity.ok(
                itemService.markLostItemAsRecovered(id, currentUser.getId())
        );
    }
    @PostMapping("/{foundItemId}/match/{lostItemId}/approve")
    public ResponseEntity<ItemResponse> approveMatchClaim(
            @PathVariable Long foundItemId,
            @PathVariable Long lostItemId,
            @AuthenticationPrincipal User currentUser) {

        return ResponseEntity.ok(
                itemService.approveMatchClaim(foundItemId, lostItemId, currentUser.getId())
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteItem(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        itemService.deleteItem(id, currentUser.getId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/claims")
    public ResponseEntity<List<ClaimRequestResponse>> getPendingClaimRequests(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {

        return ResponseEntity.ok(
                itemService.getPendingClaimRequests(id, currentUser.getId())
        );
    }

    @PostMapping("/{id}/claims/{claimRequestId}/approve")
    public ResponseEntity<ItemResponse> approveClaimRequest(
            @PathVariable Long id,
            @PathVariable Long claimRequestId,
            @AuthenticationPrincipal User currentUser) {

        return ResponseEntity.ok(
                itemService.approveClaimRequest(id, claimRequestId, currentUser.getId())
        );
    }

}
