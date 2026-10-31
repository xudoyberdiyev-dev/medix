package uz.medix.shared.numbering;

/** Hujjat prefikslari (SPEC 7-bo'lim). */
public enum DocumentPrefix {
    BY("Buyurtma"),
    SV("Sotuv"),
    HF("Hisob-faktura"),
    NK("Nakladnoy"),
    RS("Reys"),
    KR("Kirim"),
    BNS("Bonus (yetkazib beruvchidan)"),
    QM("Mijozdan qaytarish"),
    QY("YB ga qaytarish"),
    HC("Hisobdan chiqarish"),
    NO("Narx o'zgarishi"),
    MT("Mijozdan to'lov"),
    YT("Yetkazib beruvchiga to'lov"),
    KO("Kassa operatsiyasi"),
    BO("Bank operatsiyasi"),
    IO("Hisoblar orasida o'tkazma"),
    AH("Avansni hisobga olish"),
    AS("Akt sverka"),
    ZK("Zona ko'chirishi"),
    OK("Ombor ko'chirishi"),
    FS("Filiallararo savdo"),
    IN("Inventarizatsiya"),
    BQ("Boshlang'ich qoldiq");

    private final String title;

    DocumentPrefix(String title) {
        this.title = title;
    }

    public String title() {
        return title;
    }
}
