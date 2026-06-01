package com.foundit.repository;

import com.foundit.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByUserIdOrderByTimestampDesc(Long userId);
    long countByUserIdAndStatus(Long userId, com.foundit.model.NotificationStatus status);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.relatedItemId = :itemId")
    void deleteByRelatedItemId(@Param("itemId") Long itemId);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.match.id = :matchId")
    void deleteByMatchId(@Param("matchId") Long matchId);
}
