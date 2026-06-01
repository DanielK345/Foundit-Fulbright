package com.foundit.repository;

import com.foundit.model.Item;
import com.foundit.model.ItemStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ItemRepository extends JpaRepository<Item, Long> {

    List<Item> findByStatusNotOrderByDatePostedDesc(ItemStatus status);

    List<Item> findByUserIdOrderByDatePostedDesc(Long userId);

    List<Item> findByStatusAndItemTypeNotOrderByDatePostedDesc(ItemStatus status, ItemStatus itemType);

    List<Item> findByItemTypeAndStatusNotOrderByDatePostedDesc(ItemStatus itemType, ItemStatus excludedStatus);

    @Query("SELECT i FROM Item i WHERE i.status <> :claimed AND " +
           "(LOWER(i.name) LIKE LOWER(CONCAT('%', :kw, '%')) OR " +
           "LOWER(i.description) LIKE LOWER(CONCAT('%', :kw, '%')))")
    List<Item> searchByKeyword(@Param("kw") String keyword, @Param("claimed") ItemStatus claimed);

    @Query("SELECT i FROM Item i WHERE i.status <> :claimed AND " +
           "LOWER(i.category) = LOWER(:category) ORDER BY i.datePosted DESC")
    List<Item> findByCategoryExcludingClaimed(@Param("category") String category,
                                               @Param("claimed") ItemStatus claimed);

    @Query("SELECT i FROM Item i WHERE i.status <> :claimed AND " +
           "LOWER(i.category) = LOWER(:category) AND " +
           "(LOWER(i.name) LIKE LOWER(CONCAT('%', :kw, '%')) OR " +
           "LOWER(i.description) LIKE LOWER(CONCAT('%', :kw, '%'))) " +
           "ORDER BY i.datePosted DESC")
    List<Item> searchByCategoryAndKeyword(@Param("category") String category,
                                           @Param("kw") String keyword,
                                           @Param("claimed") ItemStatus claimed);
}
