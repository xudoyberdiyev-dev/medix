package uz.yuzplus.shared.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** F1: tepada tanlangan filial bilan toraytirilgan doira. */
class ActorTest {

    @Test
    void scopedToNarrowsAllBranchesActor() {
        Actor director = new Actor(1, null, true);
        assertThat(director.scopedTo(null)).isSameAs(director);
        Actor scoped = director.scopedTo(2L);
        assertThat(scoped.allBranches()).isFalse();
        assertThat(scoped.canAccessBranch(2)).isTrue();
        assertThat(scoped.canAccessBranch(1)).isFalse();
    }

    @Test
    void scopedToForeignBranchSeesNothing() {
        Actor manager = new Actor(5, 1L, false);
        assertThat(manager.scopedTo(1L).canAccessBranch(1)).isTrue();
        Actor foreign = manager.scopedTo(2L);
        assertThat(foreign.canAccessBranch(2)).isFalse();
        assertThat(foreign.canAccessBranch(1)).isFalse();
    }
}
