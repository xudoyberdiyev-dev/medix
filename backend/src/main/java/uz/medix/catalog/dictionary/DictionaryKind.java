package uz.medix.catalog.dictionary;

/** Oddiy ma'lumotnomalar (nom + ixtiyoriy qisqa nom). Jadval nomi — faqat shu ro'yxatdan (SQL'ga foydalanuvchi matni tushmaydi). */
public enum DictionaryKind {
    MANUFACTURER("manufacturer", false),
    CATEGORY("category", false),
    UNIT("unit", true),
    COUNTRY("country", true),
    REGION("region", false);

    private final String table;
    private final boolean shortNameUsed;

    DictionaryKind(String table, boolean shortNameUsed) {
        this.table = table;
        this.shortNameUsed = shortNameUsed;
    }

    String table() {
        return table;
    }

    /** Birlik — qisqa yozuvi, davlat — ISO kodi; boshqalarda qisqa nom yo'q. */
    public boolean shortNameUsed() {
        return shortNameUsed;
    }
}
