package com.foundit.repository;

import com.foundit.model.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Query("SELECT m FROM ChatMessage m WHERE " +
           "((m.sender.id = :a AND m.recipient.id = :b) OR " +
           "(m.sender.id = :b AND m.recipient.id = :a)) " +
           "AND ((:itemId IS NULL AND m.relatedItemId IS NULL) OR (:itemId IS NOT NULL AND m.relatedItemId = :itemId)) " +
           "ORDER BY m.sentAt ASC")
    List<ChatMessage> findConversation(@Param("a") Long userA, @Param("b") Long userB, @Param("itemId") Long itemId);

    @Query(value = "SELECT CASE WHEN sender_id = :uid THEN recipient_id ELSE sender_id END as partner_id, " +
                   "related_item_id " +
                   "FROM chat_messages WHERE sender_id = :uid OR recipient_id = :uid " +
                   "GROUP BY partner_id, related_item_id",
           nativeQuery = true)
    List<Object[]> findConversationPartnerAndItemIds(@Param("uid") Long userId);

    @Query("SELECT m FROM ChatMessage m WHERE m.recipient.id = :uid AND m.sender.id = :partnerId " +
           "AND ((:itemId IS NULL AND m.relatedItemId IS NULL) OR (:itemId IS NOT NULL AND m.relatedItemId = :itemId)) " +
           "AND m.read = false")
    List<ChatMessage> findUnreadFrom(@Param("uid") Long uid, @Param("partnerId") Long partnerId, @Param("itemId") Long itemId);
}
