// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title BugBounty
 * @dev Contract for managing bug bounty submissions and rewards
 */
contract BugBounty {
    // Severity levels for bug reports
    enum Severity { None, Low, Medium, High, Critical }
    
    // Status of bug reports
    enum Status { Submitted, UnderReview, Accepted, Rejected, Paid }
    
    // Structure to store bug report details
    struct BugReport {
        address reporter;
        string description;
        string proofOfConcept;
        Severity severity;
        Status status;
        uint256 submissionTime;
        uint256 reward;
    }

    // Structure for reward tiers
    struct RewardTier {
        uint256 lowReward;
        uint256 mediumReward;
        uint256 highReward;
        uint256 criticalReward;
    }

    // State variables
    address public owner;
    address public validator;
    uint256 public totalBountyPaid;
    uint256 public reportCount;
    RewardTier public rewardTier;
    
    // Mapping to store bug reports
    mapping(uint256 => BugReport) public bugReports;
    // Mapping to track if an address is a trusted validator
    mapping(address => bool) public validators;
    // Mapping to track reports by reporter
    mapping(address => uint256[]) public reporterSubmissions;

    // Events
    event BugReported(uint256 indexed reportId, address indexed reporter, Severity severity);
    event ReportStatusUpdated(uint256 indexed reportId, Status newStatus);
    event RewardPaid(uint256 indexed reportId, address indexed reporter, uint256 amount);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event RewardTierUpdated(uint256 lowReward, uint256 mediumReward, uint256 highReward, uint256 criticalReward);

    // Custom errors
    error Unauthorized(address caller);
    error InvalidSeverity();
    error InvalidReportId();
    error InvalidStatus();
    error InsufficientFunds();
    error InvalidValidator();
    error InvalidRewardAmount();
    error AlreadyPaid();

    // Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    modifier onlyValidator() {
        if (!validators[msg.sender]) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    modifier validReportId(uint256 reportId) {
        if (reportId >= reportCount) {
            revert InvalidReportId();
        }
        _;
    }

    constructor(address _validator) {
        owner = msg.sender;
        validators[_validator] = true;
        emit ValidatorAdded(_validator);

        // Set initial reward tiers (in wei)
        rewardTier = RewardTier({
            lowReward: 0.1 ether,
            mediumReward: 0.5 ether,
            highReward: 1 ether,
            criticalReward: 5 ether
        });
    }

    /**
     * @dev Submit a new bug report
     * @param description Description of the bug
     * @param proofOfConcept Proof of concept or reproduction steps
     * @param severity Severity level of the bug
     */
    function submitBugReport(
        string calldata description,
        string calldata proofOfConcept,
        Severity severity
    ) external {
        if (severity == Severity.None) {
            revert InvalidSeverity();
        }

        uint256 reportId = reportCount++;
        
        bugReports[reportId] = BugReport({
            reporter: msg.sender,
            description: description,
            proofOfConcept: proofOfConcept,
            severity: severity,
            status: Status.Submitted,
            submissionTime: block.timestamp,
            reward: 0
        });

        reporterSubmissions[msg.sender].push(reportId);
        
        emit BugReported(reportId, msg.sender, severity);
    }

    /**
     * @dev Update the status of a bug report
     * @param reportId ID of the report to update
     * @param newStatus New status to set
     * @param severity Updated severity level (if accepting)
     */
    function updateReportStatus(
        uint256 reportId,
        Status newStatus,
        Severity severity
    ) external onlyValidator validReportId(reportId) {
        BugReport storage report = bugReports[reportId];
        
        if (report.status == Status.Paid) {
            revert AlreadyPaid();
        }

        if (newStatus == Status.Accepted) {
            report.severity = severity;
            report.reward = getRewardAmount(severity);
        }

        report.status = newStatus;
        emit ReportStatusUpdated(reportId, newStatus);
    }

    /**
     * @dev Pay reward for an accepted bug report
     * @param reportId ID of the report to pay reward for
     */
    function payReward(uint256 reportId) external onlyValidator validReportId(reportId) {
        BugReport storage report = bugReports[reportId];
        
        if (report.status != Status.Accepted) {
            revert InvalidStatus();
        }
        
        if (address(this).balance < report.reward) {
            revert InsufficientFunds();
        }

        uint256 reward = report.reward;
        report.status = Status.Paid;
        totalBountyPaid += reward;

        (bool success, ) = report.reporter.call{value: reward}("");
        require(success, "Transfer failed");

        emit RewardPaid(reportId, report.reporter, reward);
    }

    /**
     * @dev Add a new validator
     * @param _validator Address of the new validator
     */
    function addValidator(address _validator) external onlyOwner {
        if (_validator == address(0)) {
            revert InvalidValidator();
        }
        validators[_validator] = true;
        emit ValidatorAdded(_validator);
    }

    /**
     * @dev Remove a validator
     * @param _validator Address of the validator to remove
     */
    function removeValidator(address _validator) external onlyOwner {
        if (!validators[_validator]) {
            revert InvalidValidator();
        }
        validators[_validator] = false;
        emit ValidatorRemoved(_validator);
    }

    /**
     * @dev Update reward tiers
     */
    function updateRewardTiers(
        uint256 lowReward,
        uint256 mediumReward,
        uint256 highReward,
        uint256 criticalReward
    ) external onlyOwner {
        if (mediumReward <= lowReward ||
            highReward <= mediumReward ||
            criticalReward <= highReward) {
            revert InvalidRewardAmount();
        }

        rewardTier = RewardTier({
            lowReward: lowReward,
            mediumReward: mediumReward,
            highReward: highReward,
            criticalReward: criticalReward
        });

        emit RewardTierUpdated(lowReward, mediumReward, highReward, criticalReward);
    }

    /**
     * @dev Get reward amount for a severity level
     * @param severity Severity level to get reward for
     */
    function getRewardAmount(Severity severity) public view returns (uint256) {
        if (severity == Severity.Low) return rewardTier.lowReward;
        if (severity == Severity.Medium) return rewardTier.mediumReward;
        if (severity == Severity.High) return rewardTier.highReward;
        if (severity == Severity.Critical) return rewardTier.criticalReward;
        return 0;
    }

    /**
     * @dev Get all report IDs submitted by an address
     * @param reporter Address of the reporter
     */
    function getReporterSubmissions(address reporter) external view returns (uint256[] memory) {
        return reporterSubmissions[reporter];
    }

    /**
     * @dev Get detailed bug report information
     * @param reportId ID of the report to fetch
     */
    function getBugReport(uint256 reportId) external view 
        validReportId(reportId) 
        returns (
            address reporter,
            string memory description,
            string memory proofOfConcept,
            Severity severity,
            Status status,
            uint256 submissionTime,
            uint256 reward
        ) 
    {
        BugReport storage report = bugReports[reportId];
        return (
            report.reporter,
            report.description,
            report.proofOfConcept,
            report.severity,
            report.status,
            report.submissionTime,
            report.reward
        );
    }

    /**
     * @dev Allow contract to receive ETH
     */
    receive() external payable {}
}