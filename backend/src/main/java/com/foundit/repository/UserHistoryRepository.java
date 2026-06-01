package com.foundit.repository;

import com.foundit.model.UserHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserHistoryRepository extends JpaRepository<UserHistory, Long> {
    List<UserHistory> findByUserIdOrderByTimestampDesc(Long userId);

    @Modifying
    @Query("DELETE FROM UserHistory h WHERE h.itemId = :itemId")
    void deleteByItemId(@Param("itemId") Long itemId);
}
