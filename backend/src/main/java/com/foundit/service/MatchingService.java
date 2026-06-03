package com.foundit.service;

import com.foundit.model.Item;
import com.foundit.model.ItemStatus;
import com.foundit.model.Match;
import com.foundit.repository.ItemRepository;
import com.foundit.repository.MatchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor 
public class MatchingService {

    private static final double JACCARD_THRESHOLD = 0.60;

    private final ItemRepository itemRepository;
    private final MatchRepository matchRepository;
    private final NotificationService notificationService;

    @Async
    @Transactional
    public void findMatchesForItem(Item newItem) {
        ItemStatus oppositeType =
                newItem.getItemType() == ItemStatus.FOUND
                        ? ItemStatus.LOST
                        : ItemStatus.FOUND;

        List<Item> candidates = itemRepository.findByItemTypeAndStatusNot(
                oppositeType,
                ItemStatus.CLAIMED
        );

        log.info(
                "Jaccard matching engine started for item={} ({}), candidates={}",
                newItem.getId(),
                newItem.getItemType(),
                candidates.size()
        );

        for (Item candidate : candidates) {
            if (candidate.getId().equals(newItem.getId())) {
                continue;
            }

            Item lostItem =
                    newItem.getItemType() == ItemStatus.LOST
                            ? newItem
                            : candidate;

            Item foundItem =
                    newItem.getItemType() == ItemStatus.FOUND
                            ? newItem
                            : candidate;

            if (matchRepository.existsByLostItemAndFoundItem(lostItem, foundItem)) {
                continue;
            }

            double similarityScore = calculateJaccardSimilarity(lostItem, foundItem);

            if (similarityScore >= JACCARD_THRESHOLD) {
                Match match = matchRepository.save(
                        Match.builder()
                                .lostItem(lostItem)
                                .foundItem(foundItem)
                                .similarityScore((float) similarityScore)
                                .build()
                );

                log.info(
                        "Jaccard match found: lost={}, found={}, score={}",
                        lostItem.getId(),
                        foundItem.getId(),
                        similarityScore
                );

                String msgForFinder = String.format(
                        "Potential match found! Your posted found item '%s' has a high chance to match with %s's posted lost item.",
                        foundItem.getName(),
                        lostItem.getUser().getName()
                );

                notificationService.createNotification(
                        foundItem.getUser(),
                        match,
                        msgForFinder,
                        lostItem.getId()
                );

                if (!lostItem.getUser().getId().equals(foundItem.getUser().getId())) {
                    String msgForLostPoster = String.format(
                            "Potential match found! Your posted lost item '%s' has a high chance to match with %s's posted found item.",
                            lostItem.getName(),
                            foundItem.getUser().getName()
                    );

                    notificationService.createNotification(
                            lostItem.getUser(),
                            match,
                            msgForLostPoster,
                            foundItem.getId()
                    );
                }
            }
        }
    }

    private double calculateJaccardSimilarity(Item lostItem, Item foundItem) {
        Set<String> lostTokens = tokenize(buildText(lostItem));
        Set<String> foundTokens = tokenize(buildText(foundItem));

        if (lostTokens.isEmpty() || foundTokens.isEmpty()) {
            return 0.0;
        }

        Set<String> intersection = new HashSet<>(lostTokens);
        intersection.retainAll(foundTokens);

        Set<String> union = new HashSet<>(lostTokens);
        union.addAll(foundTokens);

        if (union.isEmpty()) {
            return 0.0;
        }

        return (double) intersection.size() / union.size();
    }

    private String buildText(Item item) {
        StringBuilder sb = new StringBuilder();

        if (item.getName() != null && !item.getName().isBlank()) {
            sb.append(item.getName()).append(" ");
        }

        if (item.getDescription() != null && !item.getDescription().isBlank()) {
            sb.append(item.getDescription()).append(" ");
        }

        if (item.getLocationFound() != null && !item.getLocationFound().isBlank()) {
            sb.append(item.getLocationFound()).append(" ");
        }

        return sb.toString().trim();
    }

    private Set<String> tokenize(String text) {
        if (text == null || text.isBlank()) {
            return new HashSet<>();
        }

        Set<String> stopWords = Set.of(
                "the", "a", "an", "is", "it", "this", "that",
                "was", "are", "has", "have", "had",
                "for", "and", "but", "or", "not", "with",
                "to", "of", "in", "on", "at", "by", "from"
        );

        return Arrays.stream(text.toLowerCase().split("\\W+"))
                .filter(word -> word.length() > 2)
                .filter(word -> !stopWords.contains(word))
                .collect(Collectors.toSet());
    }
}