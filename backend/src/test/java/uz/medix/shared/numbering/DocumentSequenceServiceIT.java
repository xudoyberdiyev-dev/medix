package uz.medix.shared.numbering;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import uz.medix.TestcontainersConfig;

@SpringBootTest
@Import(TestcontainersConfig.class)
class DocumentSequenceServiceIT {

    @Autowired
    DocumentSequenceService sequences;

    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    TransactionTemplate tx;

    @Test
    void numbersIncreasePerPrefixAndBranch() {
        DocumentNumber first = sequences.next(DocumentPrefix.QM, "TSH");
        DocumentNumber second = sequences.next(DocumentPrefix.QM, "TSH");
        DocumentNumber otherBranch = sequences.next(DocumentPrefix.QM, "SMQ");

        assertThat(second.sequence()).isEqualTo(first.sequence() + 1);
        assertThat(otherBranch.sequence()).isEqualTo(1);
        assertThat(otherBranch).hasToString("QM-SMQ-000001");
    }

    @Test
    void concurrentCallsNeverReturnDuplicates() throws Exception {
        int calls = 200;
        List<Callable<DocumentNumber>> tasks = new ArrayList<>();
        for (int i = 0; i < calls; i++) {
            tasks.add(() -> sequences.next(DocumentPrefix.BY, "TSH"));
        }
        Set<String> issued = new HashSet<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
            for (Future<DocumentNumber> f : pool.invokeAll(tasks)) {
                issued.add(f.get().toString());
            }
        }
        assertThat(issued).hasSize(calls);
    }

    /**
     * Asosiy hovuzning barcha boʻsh ulanishlari tranzaksiyalarda band boʻlganda ham raqam beriladi
     * (avval REQUIRES_NEW ikkinchi ulanishni kutib, hovuz tugab qolardi — CashIT beqarorligi).
     */
    @Test
    void numbersAreIssuedWhenMainPoolIsFullyHeldByTransactions() throws Exception {
        HikariDataSource hikari = dataSource.unwrap(HikariDataSource.class);
        int max = hikari.getMaximumPoolSize();
        int busy = hikari.getHikariPoolMXBean() == null ? 0 : hikari.getHikariPoolMXBean().getActiveConnections();
        int n = Math.max(1, max - busy);
        CyclicBarrier allHold = new CyclicBarrier(n);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            tasks.add(() -> tx.execute(status -> {
                jdbc.sql("SELECT 1").query(Integer.class).single();
                try {
                    allHold.await(20, TimeUnit.SECONDS);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
                return sequences.next(DocumentPrefix.IO, "PLX").toString();
            }));
        }
        Set<String> issued = new HashSet<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(n)) {
            for (Future<String> f : pool.invokeAll(tasks, 60, TimeUnit.SECONDS)) {
                issued.add(f.get());
            }
        }
        assertThat(issued).hasSize(n);
    }
}
