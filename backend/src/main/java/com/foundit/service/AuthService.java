package com.foundit.service;

import com.foundit.dto.*;
import com.foundit.model.PasswordResetToken;
import com.foundit.model.User;
import com.foundit.model.UserHistory;
import com.foundit.repository.PasswordResetTokenRepository;
import com.foundit.repository.UserHistoryRepository;
import com.foundit.repository.UserRepository;
import com.foundit.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Random;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Logger log = Logger.getLogger(AuthService.class.getName());

    private final UserRepository userRepository;
    private final UserHistoryRepository userHistoryRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final JavaMailSender mailSender;

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String email = req.getEmail().trim().toLowerCase();
        if (!email.endsWith("@fulbright.edu.vn") && !email.endsWith("@student.fulbright.edu.vn")) {
            throw new IllegalArgumentException("Only Fulbright University Vietnam emails are allowed");
        }
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered");
        }
        User user = User.builder()
                .name(req.getName())
                .email(email)
                .studentId(req.getStudentId())
                .password(passwordEncoder.encode(req.getPassword()))
                .build();
        userRepository.save(user);
        userHistoryRepository.save(UserHistory.builder().user(user).actionType("REGISTERED").build());
        String token = jwtTokenProvider.generateToken(user);
        return new AuthResponse(token, user.getId(), user.getName(), user.getEmail());
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        String email = req.getEmail().trim().toLowerCase();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new BadCredentialsException("Invalid credentials")); 
        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new BadCredentialsException("Invalid credentials");
        }
        String token = jwtTokenProvider.generateToken(user);
        return new AuthResponse(token, user.getId(), user.getName(), user.getEmail());
    }

    @Transactional
    public void forgotPassword(String email) {
        // This function generates a password reset token and sends it via email. It does not reveal whether the email exists in the system for security reasons.
        // but emails are public anyway? so no acc found is more friednly since users immediately know they made a typo in their email instead of waiting for 15 minutes to find out the code doesn't work
        // why trang@fulbright.edu.vn it still send email and says We sent a code to trang@fulbright.edu.vn. Enter that code to confirm your account?
        // while with trang@student.fulbright.edu.vn it says sth went wrong due to argument exception?
        if (!userRepository.existsByEmail(email)) {
            // Return silently — don't reveal whether email exists
            // return; 
            // throwing an exception is more user-friendly since users immediately know they made a typo in their email instead of waiting for 15 minutes to find out the code doesn't work
            throw new IllegalArgumentException("No account found with that email"); // frontend handles this in which part
        }
        // Delete any existing tokens for this email
        passwordResetTokenRepository.deleteByEmail(email); 

        // Generate 6-digit OTP
        String code = String.format("%06d", new Random().nextInt(999999));

        // Save token with 15-minute expiry
        passwordResetTokenRepository.save(
                PasswordResetToken.builder()
                        .email(email)
                        .code(code)
                        .expiresAt(LocalDateTime.now().plusMinutes(15))
                        .build()
        );

        // Send email (falls back to console log if SMTP is not configured)
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(email);
            message.setSubject("FoundIt Fulbright — Password Reset Code");
            message.setText(
                    "Your password reset code is: " + code + "\n\n" +
                    "This code expires in 15 minutes.\n\n" +
                    "If you did not request a password reset, ignore this email."
            );
            mailSender.send(message);
            log.info("Password reset email sent to: " + email);
        } catch (MailException e) {
            // Email not configured — print code to console for development/testing
            log.warning("Email sending failed (check mail config). Reset code for " + email + ": " + code);
        }
    }

    @Transactional(readOnly = true)
    public void verifyResetCode(String email, String code) {
        email = email.trim().toLowerCase();
        PasswordResetToken token = passwordResetTokenRepository
                .findByEmailAndCode(email, code)
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired code"));
        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Code has expired. Please request a new one.");
        }
    }

    @Transactional
    public void resetPassword(String email, String code, String newPassword) {
        email = email.trim().toLowerCase();
        PasswordResetToken token = passwordResetTokenRepository
                .findByEmailAndCode(email, code)
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired code"));
        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Code has expired. Please request a new one.");
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        // Clean up used token
        passwordResetTokenRepository.deleteByEmail(email);
    }
}
