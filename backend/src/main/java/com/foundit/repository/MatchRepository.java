package com.foundit.repository;

import com.foundit.model.Match;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MatchRepository extends JpaRepository<Match, Long> {
    List<Match> findByLostItemIdOrFoundItemId(Long lostItemId, Long foundItemId);
    void deleteByLostItemIdOrFoundItemId(Long lostItemId, Long foundItemId);
    boolean existsByLostItemIdAndFoundItemId(Long lostItemId, Long foundItemId);
}
