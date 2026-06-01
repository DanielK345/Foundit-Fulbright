package com.foundit.controller;

import com.foundit.dto.ChatMessageRequest;
import com.foundit.dto.ChatMessageResponse;
import com.foundit.dto.ConversationSummary;
import com.foundit.model.User;
import com.foundit.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @GetMapping("/api/messages/{partnerId}")
    public ResponseEntity<List<ChatMessageResponse>> getConversation(
            @PathVariable Long partnerId,
            @RequestParam(required = false) Long itemId,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(chatService.getConversation(currentUser.getId(), partnerId, itemId));
    }

    @PostMapping("/api/messages/{recipientId}")
    public ResponseEntity<ChatMessageResponse> sendMessage(
            @PathVariable Long recipientId,
            @RequestBody ChatMessageRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                chatService.sendMessage(currentUser.getId(), recipientId, request.getItemId(), request.getContent()));
    }

    @GetMapping("/api/conversations")
    public ResponseEntity<List<ConversationSummary>> getConversations(
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(chatService.getConversations(currentUser.getId()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
    }
}
