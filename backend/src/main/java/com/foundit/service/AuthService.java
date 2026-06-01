package com.foundit.service;

import com.foundit.dto.*;
import com.foundit.model.*;
import com.foundit.repository.*;
import com.foundit.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Random;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final UserHistoryRepository userHistoryRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JavaMailSender mailSender;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (!request.getEmail().endsWith("@fulbright.edu.vn")) {
            throw new IllegalArgumentException("Only @fulbright.edu.vn email addresses are allowed");
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered");
        }

        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .studentId(request.getStudentId())
                .password(passwordEncoder.encode(request.getPassword()))
                .build();

        user = userRepository.save(user);

        userHistoryRepository.save(UserHistory.builder()
                .user(user)
                .actionType("REGISTERED")
                .build());

        String token = jwtTokenProvider.generateToken(user.getEmail(), user.getId());
        return buildAuthResponse(user, token);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email or password");
        }

        String token = jwtTokenProvider.generateToken(user.getEmail(), user.getId());
        return buildAuthResponse(user, token);
    }

    @Transactional
    public void forgotPassword(String email) {
        // Check user exists (silently fail to not reveal account existence)
        if (!userRepository.existsByEmail(email)) {
            return;
        }

        passwordResetTokenRepository.deleteByEmail(email);

        String code = String.format("%06d", new Random().nextInt(1000000));
        PasswordResetToken token = PasswordResetToken.builder()
                .email(email)
                .code(code)
                .expiresAt(LocalDateTime.now().plusMinutes(15))
                .build();
        passwordResetTokenRepository.save(token);

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(email);
            message.setSubject("FoundIt — Password Reset Code");
            message.setText("Your password reset code is: " + code + "\n\nThis code expires in 15 minutes.");
            mailSender.send(message);
        } catch (Exception e) {
            // Print to console as fallback when mail is not configured
            System.out.println("[PASSWORD RESET] Code for " + email + ": " + code);
        }
    }

    @Transactional(readOnly = true)
    public boolean verifyResetCode(String email, String code) {
        return passwordResetTokenRepository.findByEmailAndCode(email, code)
                .map(t -> t.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElse(false);
    }

    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        PasswordResetToken token = passwordResetTokenRepository
                .findByEmailAndCode(request.getEmail(), request.getCode())
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired reset code"));

        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Reset code has expired");
        }

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
        passwordResetTokenRepository.deleteByEmail(request.getEmail());
    }

    private AuthResponse buildAuthResponse(User user, String token) {
        return AuthResponse.builder()
                .token(token)
                .userId(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .profilePicture(user.getProfilePicture())
                .build();
    }
}
