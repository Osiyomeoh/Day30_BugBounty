import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("BugBounty", function () {
  async function deployBugBountyFixture() {
    const [owner, validator, reporter, otherAccount] = await hre.ethers.getSigners();

    const BugBounty = await hre.ethers.getContractFactory("BugBounty");
    const bugBounty = await BugBounty.deploy(validator.address);

    // Fund the contract
    await owner.sendTransaction({
      to: bugBounty.target,
      value: hre.ethers.parseEther("10.0")
    });

    return { bugBounty, owner, validator, reporter, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { bugBounty, owner } = await loadFixture(deployBugBountyFixture);
      expect(await bugBounty.owner()).to.equal(owner.address);
    });

    it("Should set the initial validator", async function () {
      const { bugBounty, validator } = await loadFixture(deployBugBountyFixture);
      expect(await bugBounty.validators(validator.address)).to.be.true;
    });

    it("Should set initial reward tiers", async function () {
      const { bugBounty } = await loadFixture(deployBugBountyFixture);
      const tier = await bugBounty.rewardTier();
      expect(tier.lowReward).to.equal(hre.ethers.parseEther("0.1"));
      expect(tier.criticalReward).to.equal(hre.ethers.parseEther("5.0"));
    });
  });

  describe("Bug Reporting", function () {
    it("Should allow submitting bug reports", async function () {
      const { bugBounty, reporter } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(reporter).submitBugReport(
        "Critical vulnerability",
        "PoC code here",
        3 // High severity
      )).to.emit(bugBounty, "BugReported")
        .withArgs(0, reporter.address, 3);

      const report = await bugBounty.bugReports(0);
      expect(report.reporter).to.equal(reporter.address);
      expect(report.severity).to.equal(3);
    });

    it("Should track reporter submissions", async function () {
      const { bugBounty, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "First bug",
        "PoC",
        2
      );
      
      await bugBounty.connect(reporter).submitBugReport(
        "Second bug",
        "PoC",
        3
      );

      const submissions = await bugBounty.getReporterSubmissions(reporter.address);
      expect(submissions.length).to.equal(2);
      expect(submissions[0]).to.equal(0);
      expect(submissions[1]).to.equal(1);
    });

    it("Should revert on invalid severity", async function () {
      const { bugBounty, reporter } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(reporter).submitBugReport(
        "Invalid severity",
        "PoC",
        0
      )).to.be.revertedWithCustomError(bugBounty, "InvalidSeverity");
    });
  });

  describe("Report Validation", function () {
    it("Should allow validators to update report status", async function () {
      const { bugBounty, validator, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Bug description",
        "PoC",
        3
      );

      await expect(bugBounty.connect(validator).updateReportStatus(
        0,
        2, // Accepted
        3  // High severity
      )).to.emit(bugBounty, "ReportStatusUpdated")
        .withArgs(0, 2);
    });

    it("Should revert if non-validator tries to update status", async function () {
      const { bugBounty, reporter, otherAccount } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Bug description",
        "PoC",
        3
      );

      await expect(bugBounty.connect(otherAccount).updateReportStatus(
        0,
        2,
        3
      )).to.be.revertedWithCustomError(bugBounty, "Unauthorized");
    });
  });

  describe("Reward Payment", function () {
    it("Should pay correct reward amount", async function () {
      const { bugBounty, validator, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Critical bug",
        "PoC",
        4 // Critical severity
      );

      await bugBounty.connect(validator).updateReportStatus(
        0,
        2, // Accepted
        4  // Critical severity
      );

      await expect(bugBounty.connect(validator).payReward(0))
        .to.changeEtherBalances(
          [bugBounty, reporter],
          [-(hre.ethers.parseEther("5.0")), hre.ethers.parseEther("5.0")]
        );
    });

    it("Should not allow paying for unaccepted reports", async function () {
      const { bugBounty, validator, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Bug description",
        "PoC",
        3
      );

      await expect(bugBounty.connect(validator).payReward(0))
        .to.be.revertedWithCustomError(bugBounty, "InvalidStatus");
    });

    it("Should not allow paying the same report twice", async function () {
      const { bugBounty, validator, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Critical bug",
        "PoC",
        4
      );

      await bugBounty.connect(validator).updateReportStatus(0, 2, 4);
      await bugBounty.connect(validator).payReward(0);

      await expect(bugBounty.connect(validator).payReward(0))
        .to.be.revertedWithCustomError(bugBounty, "InvalidStatus");
    });
  });

  describe("Validator Management", function () {
    it("Should allow owner to add validators", async function () {
      const { bugBounty, owner, otherAccount } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(owner).addValidator(otherAccount.address))
        .to.emit(bugBounty, "ValidatorAdded")
        .withArgs(otherAccount.address);

      expect(await bugBounty.validators(otherAccount.address)).to.be.true;
    });

    it("Should allow owner to remove validators", async function () {
      const { bugBounty, owner, validator } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(owner).removeValidator(validator.address))
        .to.emit(bugBounty, "ValidatorRemoved")
        .withArgs(validator.address);

      expect(await bugBounty.validators(validator.address)).to.be.false;
    });

    it("Should not allow non-owners to add validators", async function () {
      const { bugBounty, otherAccount } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(otherAccount).addValidator(otherAccount.address))
        .to.be.revertedWithCustomError(bugBounty, "Unauthorized");
    });
  });

  describe("Reward Tier Management", function () {
    it("Should allow owner to update reward tiers", async function () {
      const { bugBounty, owner } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(owner).updateRewardTiers(
        hre.ethers.parseEther("0.2"),
        hre.ethers.parseEther("0.6"),
        hre.ethers.parseEther("1.2"),
        hre.ethers.parseEther("6.0")
      )).to.emit(bugBounty, "RewardTierUpdated");

      const tier = await bugBounty.rewardTier();
      expect(tier.lowReward).to.equal(hre.ethers.parseEther("0.2"));
      expect(tier.criticalReward).to.equal(hre.ethers.parseEther("6.0"));
    });

    it("Should revert if reward tiers are not increasing", async function () {
      const { bugBounty, owner } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.connect(owner).updateRewardTiers(
        hre.ethers.parseEther("0.2"),
        hre.ethers.parseEther("0.1"), // Invalid: lower than low reward
        hre.ethers.parseEther("1.2"),
        hre.ethers.parseEther("6.0")
      )).to.be.revertedWithCustomError(bugBounty, "InvalidRewardAmount");
    });
  });

  describe("Report Query Functions", function () {
    it("Should return correct report details", async function () {
      const { bugBounty, reporter } = await loadFixture(deployBugBountyFixture);
      
      await bugBounty.connect(reporter).submitBugReport(
        "Test bug",
        "Test PoC",
        3
      );

      const report = await bugBounty.getBugReport(0);
      expect(report.reporter).to.equal(reporter.address);
      expect(report.description).to.equal("Test bug");
      expect(report.proofOfConcept).to.equal("Test PoC");
      expect(report.severity).to.equal(3);
    });

    it("Should revert on invalid report ID", async function () {
      const { bugBounty } = await loadFixture(deployBugBountyFixture);
      
      await expect(bugBounty.getBugReport(999))
        .to.be.revertedWithCustomError(bugBounty, "InvalidReportId");
    });
  });
});