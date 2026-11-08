package uz.medix.identity.organization;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** Logotip faylini tekshirish: faqat PNG (imzo bo'yicha) yoki xavfsiz SVG, 2 MB gacha. */
public final class CompanyLogos {

    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public static final String PNG = "image/png";
    public static final String SVG = "image/svg+xml";

    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    /** SVG ichida skript, voqea ishlovchilari yoki tashqi havolalar bo'lmasin. */
    private static final Pattern SVG_UNSAFE =
            Pattern.compile("<script|<foreignobject|javascript:|\\son[a-z]+\\s*=|<iframe|<embed|<object", Pattern.CASE_INSENSITIVE);

    private CompanyLogos() {}

    /** Fayl turi (mazmun bo'yicha) yoki bo'sh — qo'llab-quvvatlanmaydi. */
    public static Optional<String> detect(byte[] content) {
        if (content == null || content.length == 0) {
            return Optional.empty();
        }
        if (content.length >= PNG_SIGNATURE.length) {
            boolean png = true;
            for (int i = 0; i < PNG_SIGNATURE.length; i++) {
                if (content[i] != PNG_SIGNATURE[i]) {
                    png = false;
                    break;
                }
            }
            if (png) {
                return Optional.of(PNG);
            }
        }
        String text = new String(content, StandardCharsets.UTF_8);
        if (text.startsWith("﻿")) {
            text = text.substring(1);
        }
        String head = text.stripLeading().toLowerCase(Locale.ROOT);
        boolean svg = (head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!--") || head.startsWith("<!doctype svg"))
                && head.contains("<svg");
        if (svg && !SVG_UNSAFE.matcher(text).find()) {
            return Optional.of(SVG);
        }
        return Optional.empty();
    }
}
