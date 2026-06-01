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
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/matches")
@RequiredArgsConstructor
public class MatchController {

    private final MatchRepository matchRepository;
    private final ItemService itemService;

    @GetMapping("/item/{itemId}")
    public ResponseEntity<List<ItemResponse>> getMatchesForItem(
            @PathVariable Long itemId,
            @AuthenticationPrincipal User currentUser) {
        List<Match> matches = matchRepository.findByLostItemIdOrFoundItemId(itemId, itemId);

        List<ItemResponse> results = matches.stream()
                .map(m -> {
                    // Return the OTHER item in the match pair
                    boolean isLost = m.getLostItem().getId().equals(itemId);
                    return isLost
                            ? itemService.toResponse(m.getFoundItem(), currentUser.getId())
                            : itemService.toResponse(m.getLostItem(), currentUser.getId());
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(results);
    }
}
