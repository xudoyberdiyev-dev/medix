package uz.medix.shared.numbering;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import uz.medix.TestcontainersConfig;

@SpringBootTest
@Import(TestcontainersConfig.class)
class DocumentSequenceServiceIT {

    @Autowired
    DocumentSequenceService sequences;

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
}
