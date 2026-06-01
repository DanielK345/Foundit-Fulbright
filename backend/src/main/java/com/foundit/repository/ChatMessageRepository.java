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
           "((m.sender.id = :userId AND m.recipient.id = :partnerId) OR " +
           "(m.sender.id = :partnerId AND m.recipient.id = :userId)) AND " +
           "(m.relatedItemId = :itemId OR (:itemId IS NULL AND m.relatedItemId IS NULL)) " +
           "ORDER BY m.sentAt ASC")
    List<ChatMessage> findConversation(@Param("userId") Long userId,
                                       @Param("partnerId") Long partnerId,
                                       @Param("itemId") Long itemId);

    @Query(value = "SELECT CASE WHEN sender_id = :uid THEN recipient_id ELSE sender_id END AS partner_id, " +
                   "CASE WHEN sender_id = :uid THEN NULL ELSE related_item_id END AS item_id, " +
                   "MAX(sent_at) AS last_sent " +
                   "FROM chat_messages WHERE sender_id = :uid OR recipient_id = :uid " +
                   "GROUP BY partner_id, item_id ORDER BY last_sent DESC",
           nativeQuery = true)
    List<Object[]> findConversationPartnerAndItemIds(@Param("uid") Long userId);

    @Query("SELECT COUNT(m) FROM ChatMessage m WHERE m.recipient.id = :userId AND m.read = false AND m.sender.id = :partnerId")
    long countUnreadFrom(@Param("userId") Long userId, @Param("partnerId") Long partnerId);

    @Query("SELECT m FROM ChatMessage m WHERE m.recipient.id = :userId AND m.read = false AND m.sender.id = :partnerId ORDER BY m.sentAt ASC")
    List<ChatMessage> findUnreadFrom(@Param("userId") Long userId, @Param("partnerId") Long partnerId);
}
