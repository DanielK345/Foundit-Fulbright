package com.foundit.repository;

import com.foundit.model.Notification;
import com.foundit.model.NotificationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserIdOrderByTimestampDesc(Long userId);

    long countByUserIdAndStatus(Long userId, NotificationStatus status);

    void deleteByRelatedItemId(Long itemId);

    @Modifying
    @Query("DELETE FROM Notification n WHERE n.match.id IN (SELECT m.id FROM Match m WHERE m.lostItem.id = :itemId OR m.foundItem.id = :itemId)")
    void deleteByMatchItemId(Long itemId);
}
