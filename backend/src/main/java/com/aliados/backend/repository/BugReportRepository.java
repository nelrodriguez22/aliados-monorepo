package com.aliados.backend.repository;

import com.aliados.backend.entity.BugReport;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BugReportRepository extends JpaRepository<BugReport, Long> {
    List<BugReport> findAllByOrderByCreatedAtDesc();
}
