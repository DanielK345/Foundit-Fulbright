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

    List<Item> findByStatusAndCategoryIgnoreCaseOrderByDatePostedDesc(ItemStatus status, String category);

    @Query("SELECT i FROM Item i WHERE i.status <> :claimed AND " +
           "(LOWER(i.name) LIKE LOWER(CONCAT('%', :kw, '%')) OR " +
           "LOWER(i.description) LIKE LOWER(CONCAT('%', :kw, '%')))")
    List<Item> searchByKeyword(@Param("kw") String keyword, @Param("claimed") ItemStatus claimed);

    List<Item> findAllByOrderByDatePostedDesc();

    List<Item> findByUserIdOrderByDatePostedDesc(Long userId);

    List<Item> findByItemTypeAndStatusNot(ItemStatus itemType, ItemStatus excludeStatus);

    boolean existsByUserIdAndIsPublicFalse(Long userId);
}
