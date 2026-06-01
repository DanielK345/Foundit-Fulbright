package com.foundit.service;

import com.foundit.model.*;
import com.foundit.repository.ItemRepository;
import com.foundit.repository.MatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
@RequiredArgsConstructor
public class MatchingService {

    private final ItemRepository itemRepository;
    private final MatchRepository matchRepository;
    private final NotificationService notificationService;

    private static final Set<String> STOP_WORDS = Set.of(
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
            "of", "with", "is", "was", "are", "were", "be", "been", "have", "has",
            "had", "do", "does", "did", "it", "its", "this", "that", "my", "your",
            "i", "me", "we", "you", "he", "she", "they", "them", "our", "from"
    );

    @Async
    @Transactional
    public void findMatchesForItem(Item newItem) {
        ItemStatus oppositeType = newItem.getItemType() == ItemStatus.LOST ? ItemStatus.FOUND : ItemStatus.LOST;

        List<Item> candidates = itemRepository.findByItemTypeAndStatusNotOrderByDatePostedDesc(
                oppositeType, ItemStatus.CLAIMED);

        Set<String> newTokens = tokenize(newItem);

        for (Item candidate : candidates) {
            if (newItem.getItemType() == ItemStatus.LOST) {
                if (matchRepository.existsByLostItemIdAndFoundItemId(newItem.getId(), candidate.getId())) continue;
            } else {
                if (matchRepository.existsByLostItemIdAndFoundItemId(candidate.getId(), newItem.getId())) continue;
            }

            Set<String> candidateTokens = tokenize(candidate);
            double score = jaccardSimilarity(newTokens, candidateTokens);

            if (score >= 0.60) {
                Item lostItem = newItem.getItemType() == ItemStatus.LOST ? newItem : candidate;
                Item foundItem = newItem.getItemType() == ItemStatus.FOUND ? newItem : candidate;

                Match match = matchRepository.save(Match.builder()
                        .lostItem(lostItem)
                        .foundItem(foundItem)
                        .similarityScore((float) score)
                        .build());

                notificationService.sendNotification(
                        lostItem.getUser(),
                        "Potential match found for your lost item: " + lostItem.getName(),
                        match, lostItem.getId(), null, null);

                if (!foundItem.getUser().getId().equals(lostItem.getUser().getId())) {
                    notificationService.sendNotification(
                            foundItem.getUser(),
                            "Your found item may match someone's lost item: " + foundItem.getName(),
                            match, foundItem.getId(), null, null);
                }
            }
        }
    }

    private Set<String> tokenize(Item item) {
        String text = String.join(" ",
                item.getName() != null ? item.getName() : "",
                item.getDescription() != null ? item.getDescription() : "",
                item.getLocationFound() != null ? item.getLocationFound() : "");

        Set<String> tokens = new HashSet<>();
        for (String word : text.toLowerCase().split("[^a-z0-9]+")) {
            if (word.length() > 3 && !STOP_WORDS.contains(word)) {
                tokens.add(word);
            }
        }
        return tokens;
    }

    private double jaccardSimilarity(Set<String> a, Set<String> b) {
        if (a.isEmpty() && b.isEmpty()) return 0.0;
        Set<String> intersection = new HashSet<>(a);
        intersection.retainAll(b);
        Set<String> union = new HashSet<>(a);
        union.addAll(b);
        return (double) intersection.size() / union.size();
    }
}
