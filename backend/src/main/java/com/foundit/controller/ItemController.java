package com.foundit.controller;

import com.foundit.dto.*;
import com.foundit.model.ItemStatus;
import com.foundit.model.User;
import com.foundit.service.ItemService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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
        Long userId = currentUser != null ? currentUser.getId() : null;
        return ResponseEntity.ok(itemService.getItems(status, category, keyword, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ItemResponse> getItem(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        Long userId = currentUser != null ? currentUser.getId() : null;
        return ResponseEntity.ok(itemService.getItem(id, userId));
    }

    @GetMapping("/my")
    public ResponseEntity<List<ItemResponse>> getMyItems(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.getMyItems(currentUser.getId()));
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

    @PutMapping("/{id}")
    public ResponseEntity<ItemResponse> updateItem(
            @PathVariable Long id,
            @Valid @RequestBody ItemRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.updateItem(id, request, currentUser.getId()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteItem(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        itemService.deleteItem(id, currentUser.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/claim/simple")
    public ResponseEntity<ItemResponse> simpleClaimRequest(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.simpleClaimRequest(id, currentUser.getId()));
    }

    @PostMapping("/{id}/claim/verify")
    public ResponseEntity<ClaimVerificationResponse> verifyClaim(
            @PathVariable Long id,
            @RequestBody ClaimVerificationRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.verifyClaim(id, request, currentUser.getId()));
    }

    @GetMapping("/{id}/claims")
    public ResponseEntity<List<ClaimRequestResponse>> getPendingClaims(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.getPendingClaims(id, currentUser.getId()));
    }

    @PostMapping("/{id}/claims/{claimId}/approve")
    public ResponseEntity<ItemResponse> approveClaim(
            @PathVariable Long id,
            @PathVariable Long claimId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.approveClaim(id, claimId, currentUser.getId()));
    }

    @PostMapping("/{id}/recover")
    public ResponseEntity<ItemResponse> markSelfRecovered(
            @PathVariable Long id,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.markSelfRecovered(id, currentUser.getId()));
    }

    @PostMapping("/{fId}/match/{lId}/approve")
    public ResponseEntity<ItemResponse> approveViaMatch(
            @PathVariable Long fId,
            @PathVariable Long lId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(itemService.approveViaMatch(fId, lId, currentUser.getId()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
    }
}
