package com.foundit.controller;

import com.foundit.dto.ChatMessageRequest;
import com.foundit.dto.ChatMessageResponse;
import com.foundit.dto.ConversationSummary;
import com.foundit.model.User;
import com.foundit.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

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
            @Valid @RequestBody ChatMessageRequest request,
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
                chatService.sendMessage(currentUser.getId(), recipientId, request.getContent(), request.getItemId()));
    }

    @GetMapping("/api/conversations")
    public ResponseEntity<List<ConversationSummary>> getConversations(
            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(chatService.getConversationList(currentUser.getId()));
    }

    // WebSocket message handler — clients send to /app/chat.send
    @MessageMapping("/chat.send")
    public void handleWebSocketMessage(@Payload ChatMessageRequest request, Principal principal) {
        // principal.getName() is the authenticated user's email (set by JWT)
        // For simplicity, REST endpoint is the primary channel; WebSocket is for real-time push only
    }
}
