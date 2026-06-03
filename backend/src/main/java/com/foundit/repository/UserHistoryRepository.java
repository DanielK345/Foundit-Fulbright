package com.foundit.repository;

import com.foundit.model.UserHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserHistoryRepository extends JpaRepository<UserHistory, Long> {

    List<UserHistory> findByUserIdOrderByTimestampDesc(Long userId);

    void deleteByItemId(Long itemId);
}
