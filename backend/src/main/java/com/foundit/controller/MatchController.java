package com.foundit.controller;

import com.foundit.dto.ItemResponse;
import com.foundit.model.Match;
import com.foundit.model.User;
import com.foundit.repository.MatchRepository;
import com.foundit.service.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/matches")
@RequiredArgsConstructor
public class MatchController {

    private final MatchRepository matchRepository;
    private final ItemService itemService;

    @GetMapping("/item/{itemId}")
    public ResponseEntity<List<Map<String, Object>>> getMatchesForItem(
            @PathVariable Long itemId,
            @AuthenticationPrincipal User currentUser) {

        List<Match> lostMatches = matchRepository.findByLostItemId(itemId);
        List<Match> foundMatches = matchRepository.findByFoundItemId(itemId);

        List<Map<String, Object>> results = lostMatches.stream()
                .map(m -> Map.<String, Object>of(
                        "matchId", m.getId(),
                        "score", m.getSimilarityScore(),
                        "matchedItem", itemService.toResponse(m.getFoundItem())))
                .collect(Collectors.toList());

        results.addAll(foundMatches.stream()
                .map(m -> Map.<String, Object>of(
                        "matchId", m.getId(),
                        "score", m.getSimilarityScore(),
                        "matchedItem", itemService.toResponse(m.getLostItem())))
                .collect(Collectors.toList()));

        return ResponseEntity.ok(results);
    }
}
