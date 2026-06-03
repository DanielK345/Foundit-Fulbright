package com.foundit.service;
import com.foundit.dto.ClaimVerificationResponse;
import com.foundit.dto.ClaimVerificationRequest;
import com.foundit.dto.ItemRequest;
import com.foundit.dto.ItemResponse;
import com.foundit.model.Item;
import com.foundit.model.ItemStatus;
import com.foundit.model.User;
import com.foundit.model.UserHistory;
import com.foundit.repository.ItemRepository;
import com.foundit.repository.MatchRepository;
import com.foundit.repository.NotificationRepository;
import com.foundit.repository.UserHistoryRepository;
import com.foundit.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import com.foundit.dto.ClaimRequestResponse;
import com.foundit.model.ClaimRequest;
import com.foundit.model.ClaimRequestStatus;
import com.foundit.repository.ClaimRequestRepository;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItemService {

    private final ItemRepository itemRepository;
    private final UserRepository userRepository;
    private final UserHistoryRepository userHistoryRepository;
    private final MatchRepository matchRepository;
    private final NotificationRepository notificationRepository;
    private final MatchingService matchingService;
    private final NotificationService notificationService;
    private final ClaimRequestRepository claimRequestRepository;

    private static final List<String> VALUABLE_KEYWORDS = Arrays.asList(
            "phone", "laptop", "wallet", "smartwatch", "tablet", "airpod",
            "ipad", "macbook", "iphone", "samsung", "watch", "camera"
    );

    private boolean isValuable(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return VALUABLE_KEYWORDS.stream().anyMatch(lower::contains);
    }

    @Transactional
    public ItemResponse createItem(ItemRequest req, ItemStatus itemType, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        Item item = Item.builder()
                .user(user)
                .name(req.getName())
                .description(req.getDescription())
                .category(req.getCategory())
                .locationFound(req.getLocationFound())
                .imageUrl(req.getImageUrl())
                .itemType(itemType)
                .status(itemType)
                .dateEvent(req.getDateEvent())
                .isPublic(req.isPublic())
                .build();

        Item saved = itemRepository.save(item);

        // Log history
        userHistoryRepository.save(
                UserHistory.builder()
                        .user(user)
                        .item(saved)
                        .actionType("POSTED_" + itemType.name())
                        .build());

        // Trigger matching engine asynchronously-safe within the same transaction
        matchingService.findMatchesForItem(saved);

        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ItemResponse> getItems(String status, String category, String keyword, Long currentUserId) {
        List<Item> items;

        if (StringUtils.hasText(keyword)) {
            items = itemRepository.findAll().stream()
                    .filter(i -> i.getName() != null && i.getName().toLowerCase().contains(keyword.trim().toLowerCase())
                            || i.getDescription() != null && i.getDescription().toLowerCase().contains(keyword.trim().toLowerCase()))
                    .sorted((a, b) -> b.getDatePosted().compareTo(a.getDatePosted()))
                    .collect(Collectors.toList());
        } else if (StringUtils.hasText(status) && StringUtils.hasText(category)) {
            try {
                ItemStatus itemStatus = ItemStatus.valueOf(status.toUpperCase());
                items = itemRepository.findByStatusAndCategoryIgnoreCaseOrderByDatePostedDesc(
                        itemStatus, category.trim());
            } catch (IllegalArgumentException e) {
                items = itemRepository.findAllByOrderByDatePostedDesc();
            }
        } else if (StringUtils.hasText(status)) {
            try {
                ItemStatus itemStatus = ItemStatus.valueOf(status.toUpperCase());
                items = itemRepository.findAll().stream()
                        .filter(i -> i.getStatus() == itemStatus)
                        .sorted((a, b) -> b.getDatePosted().compareTo(a.getDatePosted()))
                        .collect(Collectors.toList());
            } catch (IllegalArgumentException e) {
                items = itemRepository.findAllByOrderByDatePostedDesc();
            }
        } else if (StringUtils.hasText(category)) {
            final String[] words = category.trim().toLowerCase().split("\\s+");
            items = itemRepository.findAllByOrderByDatePostedDesc().stream()
                    .filter(i -> i.getName() != null && Arrays.stream(words)
                            .anyMatch(w -> i.getName().toLowerCase().contains(w)))
                    .collect(Collectors.toList());
        } else {
            items = itemRepository.findAllByOrderByDatePostedDesc();
        }

        return items.stream()
                .sorted((a, b) -> {
                    int groupDiff = sortGroup(a) - sortGroup(b);
                    if (groupDiff != 0) return groupDiff;
                    return b.getDatePosted().compareTo(a.getDatePosted());
                })
                .map(item -> toResponse(item, currentUserId))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ItemResponse getItemById(Long id, Long currentUserId) {
        Item item = itemRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + id));

        return toResponse(item, currentUserId);
    }

    @Transactional
    public ItemResponse claimItem(Long itemId, Long claimantId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        item.setStatus(ItemStatus.CLAIMED);
        Item saved = itemRepository.save(item);

        User claimant = userRepository.findById(claimantId)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        userHistoryRepository.save(
                UserHistory.builder()
                        .user(claimant)
                        .item(saved)
                        .actionType("CLAIMED_ITEM")
                        .build());

        return toResponse(saved);
    }

    /**
     * Non-valuable item: claimer requests claim → notify finder, store claimantId.
     */
    @Transactional
    public ItemResponse requestSimpleClaim(Long itemId, Long claimantId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        if (item.getItemType() != ItemStatus.FOUND) {
            throw new IllegalArgumentException("Only found items can be claimed");
        }

        if (item.getUser().getId().equals(claimantId)) {
            throw new IllegalArgumentException("You cannot claim your own item");
        }

        User claimant = userRepository.findById(claimantId)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        boolean alreadyPending = claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(
                itemId,
                claimantId,
                ClaimRequestStatus.PENDING
        );

        if (alreadyPending) {
            throw new IllegalArgumentException("You already submitted a claim request for this item");
        }

        ClaimRequest claimRequest = ClaimRequest.builder()
                .item(item)
                .claimant(claimant)
                .status(ClaimRequestStatus.PENDING)
                .build();

        claimRequestRepository.save(claimRequest);

        notificationService.createClaimRequestNotification(
                item.getUser(),
                itemId,
                claimant.getName(),
                item.getName()
        );

        return toResponse(item, claimantId);
    }

    @Transactional(readOnly = true)
    public List<ClaimRequestResponse> getPendingClaimRequests(Long itemId, Long ownerId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (!item.getUser().getId().equals(ownerId)) {
            throw new IllegalArgumentException("Only the finder can view claim requests");
        }

        return claimRequestRepository
                .findByItemIdAndStatus(itemId, ClaimRequestStatus.PENDING)
                .stream()
                .map(this::toClaimRequestResponse)
                .toList();
    }

    @Transactional
    public ItemResponse approveClaimRequest(Long itemId, Long claimRequestId, Long ownerId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (!item.getUser().getId().equals(ownerId)) {
            throw new IllegalArgumentException("Only the finder can approve this claim");
        }

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        ClaimRequest approvedRequest = claimRequestRepository.findById(claimRequestId)
                .orElseThrow(() -> new EntityNotFoundException("Claim request not found"));

        if (!approvedRequest.getItem().getId().equals(itemId)) {
            throw new IllegalArgumentException("Claim request does not belong to this item");
        }

        approvedRequest.setStatus(ClaimRequestStatus.APPROVED);
        claimRequestRepository.save(approvedRequest);

        List<ClaimRequest> pendingRequests =
                claimRequestRepository.findByItemIdAndStatus(itemId, ClaimRequestStatus.PENDING);

        for (ClaimRequest request : pendingRequests) {
            if (!request.getId().equals(claimRequestId)) {
                request.setStatus(ClaimRequestStatus.REJECTED);
            }
        }

        claimRequestRepository.saveAll(pendingRequests);

        item.setStatus(ItemStatus.CLAIMED);
        item.setClaimantId(approvedRequest.getClaimant().getId());

        Item saved = itemRepository.save(item);

        return toResponse(saved, ownerId);
    }

    private ClaimRequestResponse toClaimRequestResponse(ClaimRequest request) {
    User claimant = request.getClaimant();

    return ClaimRequestResponse.builder()
            .id(request.getId())
            .itemId(request.getItem().getId())
            .claimantId(claimant.getId())
            .claimantName(claimant.getName())
            .claimantEmail(claimant.getEmail())
            .status(request.getStatus())
            .createdAt(request.getCreatedAt())
            .build();
}

    /**
     * Non-valuable item: finder (owner) approves a pending claim → mark CLAIMED.
     */
    @Transactional
    public ItemResponse approveClaim(Long itemId, Long ownerId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (!item.getUser().getId().equals(ownerId)) {
            throw new IllegalArgumentException("Only the finder can approve this claim");
        }
        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        item.setStatus(ItemStatus.CLAIMED);
        Item saved = itemRepository.save(item);

        return toResponse(saved);
    }

    @Transactional
    public ItemResponse approveMatchClaim(Long foundItemId, Long lostItemId, Long finderId) {
        Item foundItem = itemRepository.findById(foundItemId)
                .orElseThrow(() -> new EntityNotFoundException("Found item not found with id: " + foundItemId));

        Item lostItem = itemRepository.findById(lostItemId)
                .orElseThrow(() -> new EntityNotFoundException("Lost item not found with id: " + lostItemId));

        if (foundItem.getItemType() != ItemStatus.FOUND) {
            throw new IllegalArgumentException("The selected found item is invalid");
        }

        if (lostItem.getItemType() != ItemStatus.LOST) {
            throw new IllegalArgumentException("The selected lost item is invalid");
        }

        if (!foundItem.getUser().getId().equals(finderId)) {
            throw new IllegalArgumentException("Only the finder can verify this match");
        }

        if (foundItem.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("This found item is already claimed");
        }

        Long claimantId = lostItem.getUser().getId();

        foundItem.setStatus(ItemStatus.CLAIMED);
        foundItem.setClaimantId(claimantId);

        Item saved = itemRepository.save(foundItem);

        return toResponse(saved, finderId);
    }

    /**
     * Valuable item: claimer submits verification form → run matching engine.
     * Score >= 50 → CLAIMED + notify both; else → notify claimer only.
     */
    @Transactional
    public ClaimVerificationResponse verifyAndClaim(Long itemId, ClaimVerificationRequest req, Long claimantId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        if (item.getUser().getId().equals(claimantId)) {
            throw new IllegalArgumentException("You cannot claim your own item");
        }

        User claimer = userRepository.findById(claimantId)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        int score = matchesClaim(item, req);
        boolean matched = score >= 50;

        if (matched) {
            // Create pending claim request instead of directly claiming
            boolean alreadyPending = claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(
                    itemId,
                    claimantId,
                    ClaimRequestStatus.PENDING
            );

            if (!alreadyPending) {
                ClaimRequest claimRequest = ClaimRequest.builder()
                        .item(item)
                        .claimant(claimer)
                        .status(ClaimRequestStatus.PENDING)
                        .build();

                claimRequestRepository.save(claimRequest);
            }

            notificationService.createClaimResultNotification(claimer, itemId, true);
            notificationService.createClaimMatchNotificationForFinder(
                    item.getUser(),
                    itemId,
                    claimer.getName()
            );

            return ClaimVerificationResponse.builder()
                    .matched(true)
                    .score(score)
                    .message("High chance match. The finder has been notified.")
                    .item(toResponse(item, claimantId))
                    .build();
        }

        notificationService.createClaimResultNotification(claimer, itemId, false);

        return ClaimVerificationResponse.builder()
                .matched(false)
                .score(score)
                .message("Your claim does not appear to match this item.")
                .item(toResponse(item, claimantId))
                .build();
    }

    private int sortGroup(Item item) {
        if (item.getStatus() == ItemStatus.CLAIMED) return 2;   // last
        if (item.getItemType() == ItemStatus.LOST) return 1;    // searching
        return 0;                                                // found first
    }

    private int matchesClaim(Item item, ClaimVerificationRequest req) {
        int score = 0;

        // Name match (40 pts): claimer's name is contained in item name or vice versa
        if (StringUtils.hasText(req.getName()) && StringUtils.hasText(item.getName())) {
            String itemName = item.getName().toLowerCase().trim();
            String claimName = req.getName().toLowerCase().trim();
            if (itemName.contains(claimName) || claimName.contains(itemName)) {
                score += 40;
            }
        }

        // Location match (30 pts)
        if (StringUtils.hasText(req.getLocation()) && StringUtils.hasText(item.getLocationFound())) {
            String itemLoc = item.getLocationFound().toLowerCase().trim();
            String claimLoc = req.getLocation().toLowerCase().trim();
            if (itemLoc.contains(claimLoc) || claimLoc.contains(itemLoc)) {
                score += 30;
            }
        }

        // Description keyword overlap (30 pts): >= 30% shared words > 3 chars
        if (StringUtils.hasText(req.getDescription()) && StringUtils.hasText(item.getDescription())) {
            Set<String> itemWords = extractKeywords(item.getDescription());
            Set<String> claimWords = extractKeywords(req.getDescription());
            if (!itemWords.isEmpty() && !claimWords.isEmpty()) {
                Set<String> intersection = new HashSet<>(itemWords);
                intersection.retainAll(claimWords);
                double overlap = (double) intersection.size() / Math.min(itemWords.size(), claimWords.size());
                if (overlap >= 0.3) {
                    score += 30;
                }
            }
        }

        return score;
    }

    private Set<String> extractKeywords(String text) {
        if (text == null) return new HashSet<>();
        return Arrays.stream(text.toLowerCase().split("\\W+"))
                .filter(w -> w.length() > 3)
                .collect(Collectors.toSet());
    }

    @Transactional
    public ItemResponse updateItem(Long itemId, ItemRequest req, Long userId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));
        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("You can only edit your own items");
        }
        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Cannot edit an item that has already been claimed");
        }
        item.setName(req.getName());
        item.setDescription(req.getDescription());
        item.setCategory(req.getCategory());
        item.setLocationFound(req.getLocationFound());
        item.setImageUrl(req.getImageUrl());
        item.setDateEvent(req.getDateEvent());
        item.setIsPublic(req.isPublic());
        return toResponse(itemRepository.save(item));
    }

    @Transactional
    public void deleteItem(Long itemId, Long userId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));
        if (!item.getUser().getId().equals(userId)) {
            throw new IllegalArgumentException("You can only delete your own items");
        }
        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Cannot delete an item that has already been claimed");
        }
        notificationRepository.deleteByRelatedItemId(itemId);
        notificationRepository.deleteByMatchItemId(itemId);
        matchRepository.deleteByLostItemIdOrFoundItemId(itemId, itemId);
        userHistoryRepository.deleteByItemId(itemId);
        itemRepository.deleteById(itemId);
    }

    @Transactional(readOnly = true)
    public List<ItemResponse> getItemsByUser(Long userId) {
        return itemRepository.findByUserIdOrderByDatePostedDesc(userId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public ItemResponse toResponse(Item item) {
    return toResponse(item, null);
}

    public ItemResponse toResponse(Item item, Long currentUserId) {
        boolean pub = item.isPublic();

        boolean currentUserHasPendingClaim = false;

        if (currentUserId != null) {
            currentUserHasPendingClaim =
                    claimRequestRepository.existsByItemIdAndClaimantIdAndStatus(
                            item.getId(),
                            currentUserId,
                            ClaimRequestStatus.PENDING
                    );
        }

        int pendingClaimCount =
                claimRequestRepository
                        .findByItemIdAndStatus(item.getId(), ClaimRequestStatus.PENDING)
                        .size();

        return ItemResponse.builder()
                .id(item.getId())
                .name(item.getName())
                .description(item.getDescription())
                .category(item.getCategory())
                .locationFound(item.getLocationFound())
                .imageUrl(item.getImageUrl())
                .status(item.getStatus() != null ? item.getStatus().name() : null)
                .itemType(item.getItemType() != null ? item.getItemType().name() : null)
                .datePosted(item.getDatePosted())
                .dateEvent(item.getDateEvent())
                .reporterId(item.getUser() != null ? item.getUser().getId() : null)
                .reporterName(pub && item.getUser() != null ? item.getUser().getName() : null)
                .reporterEmail(pub && item.getUser() != null ? item.getUser().getEmail() : null)
                .claimantId(item.getClaimantId())
                .claimantName(item.getClaimantId() != null
                        ? userRepository.findById(item.getClaimantId())
                                .map(User::getName)
                                .orElse(null)
                        : null)
                .isPublic(pub)
                .currentUserHasPendingClaim(currentUserHasPendingClaim)
                .pendingClaimCount(pendingClaimCount)
                .build();
    }
    @Transactional
    public ItemResponse markLostItemAsRecovered(Long itemId, Long ownerId) {
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item not found with id: " + itemId));

        if (!item.getUser().getId().equals(ownerId)) {
            throw new IllegalArgumentException("You can only mark your own item as recovered");
        }

        if (item.getItemType() != ItemStatus.LOST) {
            throw new IllegalArgumentException("Only lost items can be marked as recovered");
        }

        if (item.getStatus() == ItemStatus.CLAIMED) {
            throw new IllegalArgumentException("Item is already claimed");
        }

        item.setStatus(ItemStatus.CLAIMED);

        Item saved = itemRepository.save(item);

        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));

        userHistoryRepository.save(
                UserHistory.builder()
                        .user(owner)
                        .item(saved)
                        .actionType("MARKED_LOST_ITEM_RECOVERED")
                        .build()
        );

        return toResponse(saved);
    }
}
