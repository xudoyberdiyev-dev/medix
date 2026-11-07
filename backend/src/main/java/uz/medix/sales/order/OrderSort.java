package uz.medix.sales.order;

/** Buyurtmalar ro'yxatini saralash (jadval standarti, SPEC 120): standart — kiritilgan vaqti bo'yicha, yangisi tepada. */
public enum OrderSort {
    CREATED("o.created_at"),
    NUMBER("o.number"),
    DATE("o.order_date"),
    CUSTOMER("lower(c.name)"),
    TOTAL("o.total");

    private final String column;

    OrderSort(String column) {
        this.column = column;
    }

    /** ORDER BY ifodasi (barqaror: oxirida id). */
    String orderBy(boolean desc) {
        String dir = desc ? " DESC" : " ASC";
        return " ORDER BY " + column + dir + ", o.id" + dir;
    }
}
