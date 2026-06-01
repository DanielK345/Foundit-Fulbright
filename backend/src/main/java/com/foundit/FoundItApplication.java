package com.foundit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class FoundItApplication {
    public static void main(String[] args) {
        SpringApplication.run(FoundItApplication.class, args);
    }
}
