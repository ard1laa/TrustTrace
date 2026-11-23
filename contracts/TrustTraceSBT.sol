// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC5192 - Minimal Soulbound NFTs (EIP-5192 Standard)
 * @notice Interface for non-transferable, wallet-bound Soulbound Tokens (SBTs)
 */
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title TrustTraceSBT
 * @notice Permissioned IBFT Proof-of-Authority (0 Gas) Smart Contract for W3C Verifiable
 *         Micro-Credentials, DID Public Key Registry, and ERC-5192 Soulbound Tokens.
 */
contract TrustTraceSBT is IERC5192 {
    string public constant name = "TrustTrace Micro-Credential SBT";
    string public constant symbol = "TTSBT";
    bytes4 private constant _INTERFACE_ID_ERC5192 = 0xb45a3c0e;

    enum CredentialState {
        Draft,      // 0: Pending University Registrar / AI Validation
        Signed,     // 1: Signed with Issuer ECDSA secp256r1 Private Key (d_I)
        Anchored,   // 2: Pinned to IPFS & SHA-256 Hash Anchored On-Chain
        Locked,     // 3: Minted & Permanently Bound to Holder Soul (ERC-5192)
        Revoked     // 4: Administratively Revoked / Invalidated
    }

    struct SoulboundRecord {
        uint256 tokenId;
        address holderSoul;
        string studentDid;
        string issuerDid;
        bytes32 credentialHash;     // SHA-256 (z) of W3C JSON-LD Payload
        string ipfsCid;             // Content-Addressable IPFS CID
        string competencyDomain;
        uint8 masteryScore;
        uint256 issuedAt;
        CredentialState state;
        bool isLocked;
    }

    struct DIDDocumentRecord {
        string did;
        string controllerName;
        string publicKeyHex;        // secp256r1 Public Key Q_I (Uncompressed X, Y)
        string curve;               // "secp256r1" (NIST P-256)
        uint256 updatedAt;
        bool active;
    }

    address public universityRegistrar;
    uint256 private _nextTokenId = 1001;

    mapping(uint256 => SoulboundRecord) private _credentials;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(bytes32 => bool) private _anchoredHashes;
    mapping(string => DIDDocumentRecord) private _didRegistry;

    error ErrSoulboundTokenLocked(uint256 tokenId, address holderSoul, string message);
    error ErrDuplicateCredentialHash(bytes32 credentialHash);
    error ErrUnauthorizedIssuer(address caller);
    error ErrTokenDoesNotExist(uint256 tokenId);

    event CredentialAnchoredAndLocked(
        uint256 indexed tokenId,
        address indexed holderSoul,
        string studentDid,
        bytes32 indexed credentialHash,
        string ipfsCid,
        string competencyDomain
    );

    event CredentialRevoked(
        uint256 indexed tokenId,
        bytes32 indexed credentialHash,
        string reason,
        uint256 timestamp
    );

    event CredentialBurnedPDPA(
        uint256 indexed tokenId,
        address indexed holderSoul,
        bytes32 releasedHash
    );

    event DIDDocumentRegistered(
        string indexed didUri,
        string controllerName,
        string publicKeyHex
    );

    modifier onlyRegistrar() {
        if (msg.sender != universityRegistrar) {
            revert ErrUnauthorizedIssuer(msg.sender);
        }
        _;
    }

    constructor(
        string memory registrarDid,
        string memory registrarName,
        string memory publicKeyQ_I
    ) {
        universityRegistrar = msg.sender;
        _didRegistry[registrarDid] = DIDDocumentRecord({
            did: registrarDid,
            controllerName: registrarName,
            publicKeyHex: publicKeyQ_I,
            curve: "secp256r1",
            updatedAt: block.timestamp,
            active: true
        });
        emit DIDDocumentRegistered(registrarDid, registrarName, publicKeyQ_I);
    }

    function resolveDID(string calldata didUri) external view returns (DIDDocumentRecord memory) {
        return _didRegistry[didUri];
    }

    function mintSoulboundCredential(
        address holderSoul,
        string calldata studentDid,
        string calldata issuerDid,
        bytes32 credentialHash,
        string calldata ipfsCid,
        string calldata competencyDomain,
        uint8 masteryScore
    ) external onlyRegistrar returns (uint256) {
        if (_anchoredHashes[credentialHash]) {
            revert ErrDuplicateCredentialHash(credentialHash);
        }

        uint256 tokenId = _nextTokenId++;
        _anchoredHashes[credentialHash] = true;
        _owners[tokenId] = holderSoul;
        _balances[holderSoul] += 1;

        _credentials[tokenId] = SoulboundRecord({
            tokenId: tokenId,
            holderSoul: holderSoul,
            studentDid: studentDid,
            issuerDid: issuerDid,
            credentialHash: credentialHash,
            ipfsCid: ipfsCid,
            competencyDomain: competencyDomain,
            masteryScore: masteryScore,
            issuedAt: block.timestamp,
            state: CredentialState.Locked,
            isLocked: true
        });

        emit Locked(tokenId);
        emit CredentialAnchoredAndLocked(
            tokenId,
            holderSoul,
            studentDid,
            credentialHash,
            ipfsCid,
            competencyDomain
        );

        return tokenId;
    }

    function locked(uint256 tokenId) external view override returns (bool) {
        if (_owners[tokenId] == address(0)) revert ErrTokenDoesNotExist(tokenId);
        return _credentials[tokenId].isLocked;
    }

    function transferFrom(address from, address /*to*/, uint256 tokenId) external view {
        if (_owners[tokenId] == address(0)) revert ErrTokenDoesNotExist(tokenId);
        revert ErrSoulboundTokenLocked(
            tokenId,
            from,
            "ERC-5192 Revert: Soulbound Micro-Credential is permanently bound to Holder Soul and cannot be transferred or sold."
        );
    }

    function revokeCredential(uint256 tokenId, string calldata reason) external onlyRegistrar {
        if (_owners[tokenId] == address(0)) revert ErrTokenDoesNotExist(tokenId);
        _credentials[tokenId].state = CredentialState.Revoked;
        emit CredentialRevoked(tokenId, _credentials[tokenId].credentialHash, reason, block.timestamp);
    }

    function burnAndReleaseHash(uint256 tokenId) external {
        address owner = _owners[tokenId];
        if (owner == address(0)) revert ErrTokenDoesNotExist(tokenId);
        require(msg.sender == owner || msg.sender == universityRegistrar, "Not authorized");

        bytes32 releasedHash = _credentials[tokenId].credentialHash;
        _anchoredHashes[releasedHash] = false;
        _balances[owner] -= 1;
        delete _owners[tokenId];
        delete _credentials[tokenId];

        emit CredentialBurnedPDPA(tokenId, owner, releasedHash);
    }

    function verifyOnChainHash(uint256 tokenId, bytes32 candidateHash)
        external
        view
        returns (bool hashMatches, bool isNotRevoked, bool isSoulboundLocked, SoulboundRecord memory record)
    {
        if (_owners[tokenId] == address(0)) revert ErrTokenDoesNotExist(tokenId);
        record = _credentials[tokenId];
        hashMatches = (record.credentialHash == candidateHash);
        isNotRevoked = (record.state == CredentialState.Locked);
        isSoulboundLocked = record.isLocked;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC5192;
    }
}
