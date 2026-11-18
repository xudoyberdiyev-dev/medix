package uz.yuzplus;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class YuzplusApplication {

    public static final String ZONE = "Asia/Tashkent";

    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone(ZONE));
        SpringApplication.run(YuzplusApplication.class, args);
    }
}
