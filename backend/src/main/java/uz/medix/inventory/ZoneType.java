package uz.medix.inventory;

import java.util.EnumSet;
import java.util.Set;

/** Zona turlari (SPEC 2). Sotuvga ochiq — faqat {@link #MAIN}, {@link #COLD}, {@link #SAFE} (bazada ham hisoblanadi). */
public enum ZoneType {
    RECEIVING("Qabul"),
    MAIN("Asosiy saqlash"),
    QUARANTINE("Karantin"),
    SHIPPING("Joʻnatish"),
    COLD("Sovuq"),
    SAFE("Seyf");

    /** Har omborda bo'lishi shart bo'lgan zonalar. */
    public static final Set<ZoneType> REQUIRED = EnumSet.of(RECEIVING, MAIN, QUARANTINE, SHIPPING);

    private final String defaultName;

    ZoneType(String defaultName) {
        this.defaultName = defaultName;
    }

    public String defaultName() {
        return defaultName;
    }

    public boolean sellable() {
        return this == MAIN || this == COLD || this == SAFE;
    }
}
