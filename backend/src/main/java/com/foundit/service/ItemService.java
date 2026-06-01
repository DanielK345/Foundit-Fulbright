package com.foundit.service;

import com.foundit.dto.*;
import com.foundit.model.*;
import com.foundit.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItemService {

    private final ItemRepository itemRepository;
    private final UserRepository userRepository;
    private final ClaimRequestRepository claimRequestRepository;
    private final NotificationRepository notificationRepository;
    private final MatchRepository matchRepository;
    private final UserHistoryRepository userHistoryRepository;
    private final MatchingService matchingService;
    private final NotificationService notificationService;

    @Transactional
    public ItemResponse createItem(ItemRequest req, ItemStatus itemType, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        Item item = Item.builder()
                .user(user)
                .name(req.getName())
                .description(req.getDescription())
                .category(req.getCategory())
                .locationFound(req.getLocationFound())
                .imageUrl(req.getImageUrl())
                .dateEvent(req.getDateEvent())
                .itemType(itemType)
                .status(itemType)
                .isPublic(req.isPublic())
                .build();

        item = itemRepository.save(item);

        String action = itemType == ItemStatus.LOST ? "POSTED_LOST" : "POSTED_FOUND";
        userHistoryRepository.save(UserHistory.builder().user(user).itemId(item.getId()).actionType(action).build());

        matchingService.findMatchesForItem(item);

        return toResponse(item, userId);
    }

    @Transactional(readOnly = true)
    public List<ItemResponse> getItems(String status, String category, String keyword, Long currentUserId) {
        List<Item> items;

        if (keyword != null && !keyword.isBlank() && category != null && !category.isBlank()) {
            items = itemRepository.searchByCategoryAndKeyword(category, keyword, ItemStatus.CLAIMED);
        } else if (keyword != null && !keyword.isBlank()) {
            items = itemRepository.searchByKeyword(keyword, ItemStatus.CLAIMED);
        } else if (category != null && !category.isBlank()) {
            items = itemRepository.findByCategoryExcludingClaimed(category, ItemStatus.CLAIMED);
        } else if (status != null && !status.isBlank()) {
            try {
                ItemStatus itemStatus = ItemStatus.valueOf(status.toUpperCase());
                items = itemRepository.findByStatusNotOrderByDatePostedDesc(ItemStatus.CLAIMED)
                        .stream()
                        .filter(i -> i.getStatus() == itemStatus)
                        .collect(Collectors.toList());
            } catch (IllegalArgumentException e) {
                items = itemRepository.findByStatusNotOrderByDatePostedDesc(ItemStatus.CLAIMED);
            }
        } else {
            items = itemRepository.findByStatusNotOrderByDatePostedDesc(ItemStatus.CLAIMED);
        }

        return items.stream().map(i -> toResponse(i, currentUserId)).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ItemResponse getItem(Long id, Long currentUserId) {
        Item item = itemRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));
        return toResponse(item, currentUserId);
    }

    @Transactional(readOnly = true)
    public List<ItemResponse> getMyItems(Long userId) {
        return itemRepository.findByUserIdOrderByDatePostedDesc(userId)
                .stream()
                .map(i -> toResponse(i, userId))
                .collect(Collectors.toList());
    }

    @Transactional
    public ItemResponse updateItem(Long id, ItemRequest req, Long userId) {
        Item item = itemRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("You can only edit your own items");
        }
        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Cannot edit a claimed item");
        }

        item.setName(req.getName());
        item.setDescription(req.getDescription());
        item.setCategory(req.getCategory());
        item.setLocationFound(req.getLocationFound());
        item.setImageUrl(req.getImageUrl());
        item.setDateEvent(req.getDateEvent());
        item.setPublic(req.isPublic());

        return toResponse(itemRepository.save(item), userId);
    }

    @Transactional
    public void deleteItem(Long id, Long userId) {
        Item item = itemRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("You can only delete your own items");
        }
        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Cannot delete a claimed item");
        }

        // Cascading cleanup
        notificationRepository.deleteByRelatedItemId(id);
        List<Match> matches = matchRepository.findByLostItemIdOrFoundItemId(id, id);
        for (Match m : matches) {
            notificationRepository.deleteByMatchId(m.getId());
        }
        matchRepository.deleteByLostItemIdOrFoundItemId(id, id);
        claimRequestRepository.deleteByItemId(id);
        userHistoryRepository.deleteByItemId(id);

        itemRepository.delete(item);
    }

    @Transactional
    public ItemResponse simpleClaimRequest(Long itemId, Long claimantId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }
        if (item.getUser().getId().equals(claimantId)) {
            throw new IllegalArgumentException("You cannot claim your own item");
        }
        if (claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(itemId, claimantId, ClaimRequestStatus.PENDING)) {
            throw new IllegalArgumentException("You already have a pending claim for this item");
        }

        User claimant = userRepository.findById(claimantId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        claimRequestRepository.save(ClaimRequest.builder()
                .item(item)
                .claimant(claimant)
                .status(ClaimRequestStatus.PENDING)
                .build());

        notificationService.sendNotification(
                item.getUser(),
                claimant.getName() + " wants to claim your item: " + item.getName(),
                null, item.getId(), claimantId, claimant.getName());

        userHistoryRepository.save(UserHistory.builder().user(claimant).itemId(itemId).actionType("CLAIM_REQUESTED").build());

        return toResponse(item, claimantId);
    }

    @Transactional
    public ClaimVerificationResponse verifyClaim(Long itemId, ClaimVerificationRequest req, Long claimantId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }
        if (item.getUser().getId().equals(claimantId)) {
            throw new IllegalArgumentException("You cannot claim your own item");
        }

        User claimant = userRepository.findById(claimantId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        int score = computeClaimScore(item, req);

        if (score >= 50) {
            if (!claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(itemId, claimantId, ClaimRequestStatus.PENDING)) {
                claimRequestRepository.save(ClaimRequest.builder()
                        .item(item)
                        .claimant(claimant)
                        .status(ClaimRequestStatus.PENDING)
                        .build());
            }

            notificationService.sendNotification(item.getUser(),
                    claimant.getName() + " has verified a claim on: " + item.getName(),
                    null, item.getId(), claimantId, claimant.getName());

            notificationService.sendNotification(claimant,
                    "High chance match! The finder has been notified about your claim on: " + item.getName(),
                    null, item.getId(), null, null);

            userHistoryRepository.save(UserHistory.builder().user(claimant).itemId(itemId).actionType("CLAIM_VERIFIED").build());

            return ClaimVerificationResponse.builder()
                    .success(true).score(score)
                    .message("Your description closely matches the item. The finder has been notified.")
                    .item(toResponse(item, claimantId))
                    .build();
        } else {
            notificationService.sendNotification(claimant,
                    "Your claim for \"" + item.getName() + "\" did not match our records.",
                    null, item.getId(), null, null);

            return ClaimVerificationResponse.builder()
                    .success(false).score(score)
                    .message("Your claim did not match our records.")
                    .item(toResponse(item, claimantId))
                    .build();
        }
    }

    @Transactional(readOnly = true)
    public List<ClaimRequestResponse> getPendingClaims(Long itemId, Long userId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Only the item owner can view claims");
        }

        return claimRequestRepository.findByItemIdAndStatus(itemId, ClaimRequestStatus.PENDING)
                .stream()
                .map(this::toClaimResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ItemResponse approveClaim(Long itemId, Long claimId, Long userId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Only the item owner can approve claims");
        }

        ClaimRequest claimRequest = claimRequestRepository.findById(claimId)
                .orElseThrow(() -> new IllegalArgumentException("Claim not found"));

        // Approve this claim
        claimRequest.setStatus(ClaimRequestStatus.APPROVED);
        claimRequestRepository.save(claimRequest);

        // Reject all other pending claims
        claimRequestRepository.findByItemIdAndStatus(itemId, ClaimRequestStatus.PENDING)
                .forEach(c -> {
                    c.setStatus(ClaimRequestStatus.REJECTED);
                    claimRequestRepository.save(c);
                });

        // Update item
        item.setStatus(ItemStatus.CLAIMED);
        item.setClaimantId(claimRequest.getClaimant().getId());
        itemRepository.save(item);

        // Notify claimant
        notificationService.sendNotification(
                claimRequest.getClaimant(),
                "Your claim for \"" + item.getName() + "\" has been approved!",
                null, item.getId(), null, null);

        userHistoryRepository.save(UserHistory.builder()
                .user(claimRequest.getClaimant()).itemId(itemId).actionType("CLAIMED_ITEM").build());

        return toResponse(item, userId);
    }

    @Transactional
    public ItemResponse markSelfRecovered(Long itemId, Long userId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new IllegalArgumentException("Item not found"));

        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Only the reporter can mark as self-recovered");
        }
        if (item.getItemType() != ItemStatus.LOST) {
            throw new IllegalArgumentException("Only lost items can be marked as self-recovered");
        }

        item.setStatus(ItemStatus.CLAIMED);
        item.setClaimantId(userId);
        itemRepository.save(item);

        userHistoryRepository.save(UserHistory.builder()
                .user(item.getUser()).itemId(itemId).actionType("SELF_RECOVERED").build());

        return toResponse(item, userId);
    }

    @Transactional
    public ItemResponse approveViaMatch(Long foundItemId, Long lostItemId, Long userId) {
        Item foundItem = itemRepository.findById(foundItemId)
                .orElseThrow(() -> new IllegalArgumentException("Found item not found"));
        Item lostItem = itemRepository.findById(lostItemId)
                .orElseThrow(() -> new IllegalArgumentException("Lost item not found"));

        if (!foundItem.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("Only the finder can approve via match");
        }

        foundItem.setStatus(ItemStatus.CLAIMED);
        foundItem.setClaimantId(lostItem.getUser().getId());
        lostItem.setStatus(ItemStatus.CLAIMED);
        lostItem.setClaimantId(lostItem.getUser().getId());

        itemRepository.save(foundItem);
        itemRepository.save(lostItem);

        notificationService.sendNotification(
                lostItem.getUser(),
                "The finder approved your match request for: " + lostItem.getName(),
                null, lostItem.getId(), null, null);

        userHistoryRepository.save(UserHistory.builder()
                .user(lostItem.getUser()).itemId(lostItemId).actionType("CLAIMED_VIA_MATCH").build());

        return toResponse(foundItem, userId);
    }

    public ItemResponse toResponse(Item item, Long currentUserId) {
        boolean pub = item.isPublic();

        boolean hasPendingClaim = currentUserId != null &&
                claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(
                        item.getId(), currentUserId, ClaimRequestStatus.PENDING);

        int pendingClaimCount = item.getUser().getId().equals(currentUserId)
                ? claimRequestRepository.findByItemIdAndStatus(item.getId(), ClaimRequestStatus.PENDING).size()
                : 0;

        return ItemResponse.builder()
                .id(item.getId())
                .name(item.getName())
                .description(item.getDescription())
                .category(item.getCategory())
                .locationFound(item.getLocationFound())
                .imageUrl(item.getImageUrl())
                .datePosted(item.getDatePosted())
                .dateEvent(item.getDateEvent())
                .itemType(item.getItemType().name())
                .status(item.getStatus().name())
                .reporterId(item.getUser().getId())
                .reporterName(pub ? item.getUser().getName() : null)
                .reporterEmail(pub ? item.getUser().getEmail() : null)
                .reporterProfilePicture(pub ? item.getUser().getProfilePicture() : null)
                .claimantId(item.getClaimantId())
                .isPublic(item.isPublic())
                .currentUserHasPendingClaim(hasPendingClaim)
                .pendingClaimCount(pendingClaimCount)
                .build();
    }

    private ClaimRequestResponse toClaimResponse(ClaimRequest cr) {
        User claimant = cr.getClaimant();
        return ClaimRequestResponse.builder()
                .id(cr.getId())
                .itemId(cr.getItem().getId())
                .itemName(cr.getItem().getName())
                .claimantId(claimant.getId())
                .claimantName(claimant.getName())
                .claimantEmail(claimant.getEmail())
                .claimantProfilePicture(claimant.getProfilePicture())
                .status(cr.getStatus().name())
                .createdAt(cr.getCreatedAt())
                .build();
    }

    private int computeClaimScore(Item item, ClaimVerificationRequest req) {
        int score = 0;
        String itemName = item.getName() != null ? item.getName().toLowerCase() : "";
        String itemDesc = item.getDescription() != null ? item.getDescription().toLowerCase() : "";
        String itemLoc = item.getLocationFound() != null ? item.getLocationFound().toLowerCase() : "";

        String reqName = req.getName() != null ? req.getName().toLowerCase() : "";
        String reqDesc = req.getDescription() != null ? req.getDescription().toLowerCase() : "";
        String reqLoc = req.getLocation() != null ? req.getLocation().toLowerCase() : "";

        // +40 if names overlap
        if (!itemName.isEmpty() && !reqName.isEmpty()) {
            if (itemName.contains(reqName) || reqName.contains(itemName)) score += 40;
        }

        // +30 if locations overlap
        if (!itemLoc.isEmpty() && !reqLoc.isEmpty()) {
            if (itemLoc.contains(reqLoc) || reqLoc.contains(itemLoc)) score += 30;
        }

        // +30 if ≥30% of description keywords match
        if (!itemDesc.isEmpty() && !reqDesc.isEmpty()) {
            Set<String> itemWords = tokenizeText(itemDesc);
            Set<String> reqWords = tokenizeText(reqDesc);
            if (!itemWords.isEmpty() && !reqWords.isEmpty()) {
                Set<String> intersection = new java.util.HashSet<>(itemWords);
                intersection.retainAll(reqWords);
                double overlap = (double) intersection.size() / Math.min(itemWords.size(), reqWords.size());
                if (overlap >= 0.30) score += 30;
            }
        }

        return score;
    }

    private Set<String> tokenizeText(String text) {
        Set<String> tokens = new java.util.HashSet<>();
        for (String word : text.toLowerCase().split("[^a-z0-9]+")) {
            if (word.length() > 2) tokens.add(word);
        }
        return tokens;
    }
}
