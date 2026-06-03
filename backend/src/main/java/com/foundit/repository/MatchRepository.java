package com.foundit.repository;

import com.foundit.model.Item;
import com.foundit.model.Match;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MatchRepository extends JpaRepository<Match, Long> {

    List<Match> findByLostItemUserId(Long userId);

    List<Match> findByFoundItemUserId(Long userId);

    List<Match> findByLostItemId(Long lostItemId);

    List<Match> findByFoundItemId(Long foundItemId);

    boolean existsByLostItemAndFoundItem(Item lost, Item found);

    void deleteByLostItemIdOrFoundItemId(Long lostItemId, Long foundItemId);
}
